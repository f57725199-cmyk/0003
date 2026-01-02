import React, { useEffect, useState } from "react";
import { db, storage } from "../firebase";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Home = () => {
  const [users, setUsers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const { currentUser, logout } = useAuth();
  
  // Admin Check
  const isAdmin = currentUser?.email?.includes("admin"); 

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, "users"), where("uid", "!=", currentUser.uid));
        const querySnapshot = await getDocs(q);
        const userList = [];
        querySnapshot.forEach((doc) => {
          userList.push(doc.data());
        });
        setUsers(userList);
      } catch (error) {
        console.error("Error fetching users: ", error);
      }
    };

    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  const handleProfilePicChange = async (e) => {
    if (e.target.files[0]) {
        setUploading(true);
        try {
            const file = e.target.files[0];
            const fileRef = ref(storage, `profile_pics/${currentUser.uid}`);
            await uploadBytes(fileRef, file);
            const photoURL = await getDownloadURL(fileRef);
            
            await updateDoc(doc(db, "users", currentUser.uid), { photoURL });
            alert("Profile picture updated!");
            // Ideally update local state or context, but simple alert suffices for now
        } catch (error) {
            console.error("Error upload profile pic", error);
            alert("Failed to update profile pic");
        }
        setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 p-4 text-white flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold">Chats</h1>
        <div className="flex items-center gap-2">
            {isAdmin && (
                <Link to="/admin" className="bg-indigo-600 px-3 py-1 rounded text-sm hover:bg-indigo-700">
                    Admin
                </Link>
            )}
            <label className="cursor-pointer bg-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-800 flex items-center">
                {uploading ? "..." : "Set Profile"}
                <input type="file" className="hidden" onChange={handleProfilePicChange} accept="image/*" />
            </label>
            <button onClick={logout} className="bg-red-500 px-3 py-1 rounded text-sm hover:bg-red-600">Logout</button>
        </div>
      </header>
      <main className="p-4">
        <div className="bg-white rounded-lg shadow overflow-hidden max-w-2xl mx-auto">
          {users.length === 0 ? (
            <p className="p-4 text-center text-gray-500">No other users found.</p>
          ) : (
            <ul>
              {users.map((user) => (
                <li key={user.uid} className="border-b last:border-b-0">
                  <Link to={`/chat/${user.uid}`} className="block hover:bg-gray-50 p-4 flex items-center">
                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold mr-3 overflow-hidden">
                      {user.photoURL ? (
                          <img src={user.photoURL} alt="DP" className="h-full w-full object-cover" />
                      ) : (
                          <span>{user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{user.displayName || user.email}</p>
                      <p className="text-sm text-gray-500">Tap to chat</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
