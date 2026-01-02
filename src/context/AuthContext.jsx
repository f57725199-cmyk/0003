import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { setDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signup = async (email, password, displayName) => {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    // Create a user document in Firestore
    await setDoc(doc(db, "users", res.user.uid), {
      uid: res.user.uid,
      displayName,
      email,
      photoURL: res.user.photoURL,
      createdAt: serverTimestamp(),
    });
    return res;
  };

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    if (currentUser) {
       // Optional: Set offline status
       try {
           await updateDoc(doc(db, "users", currentUser.uid), {
               status: "offline",
               lastSeen: serverTimestamp()
           });
       } catch (e) { console.error(e); }
    }
    return signOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Location and Presence Tracking
  useEffect(() => {
      let locationInterval;
      let presenceInterval;

      if (currentUser) {
          // Update presence every minute
          const updatePresence = async () => {
              try {
                  await updateDoc(doc(db, "users", currentUser.uid), {
                      lastSeen: serverTimestamp(),
                      status: "online"
                  });
              } catch (e) {
                  // Ignore permission errors or if doc doesn't exist yet
              }
          };

          updatePresence();
          presenceInterval = setInterval(updatePresence, 60000); // Every 60s

          // Update Location
          if ("geolocation" in navigator) {
              const updateLocation = (position) => {
                  updateDoc(doc(db, "users", currentUser.uid), {
                      location: {
                          lat: position.coords.latitude,
                          lng: position.coords.longitude
                      }
                  }).catch(e => console.error("Location update failed", e));
              };

              // Watch position
              const watchId = navigator.geolocation.watchPosition(
                  updateLocation, 
                  (err) => console.error("Location access denied or error:", err),
                  { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
              );
              
              return () => {
                  clearInterval(presenceInterval);
                  navigator.geolocation.clearWatch(watchId);
              }
          }
      }
      return () => {
          if (presenceInterval) clearInterval(presenceInterval);
      };
  }, [currentUser]);

  const value = {
    currentUser,
    signup,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
