// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCtjCnVHwFIj9NPWZnVXcm4Ayw5YZJna54",
  authDomain: "nst2512-6a2e4.firebaseapp.com",
  databaseURL: "https://nst2512-6a2e4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nst2512-6a2e4",
  storageBucket: "nst2512-6a2e4.firebasestorage.app",
  messagingSenderId: "1041659780014",
  appId: "1:1041659780014:web:26db9e156334f2de87063f",
  measurementId: "G-VRSSQK3TB0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);

export default app;
