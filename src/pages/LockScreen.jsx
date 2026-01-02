import React, { useState } from "react";
import { useSecurity } from "../context/SecurityContext";
import { useAuth } from "../context/AuthContext";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";

const LockScreen = () => {
  const { setLocked } = useSecurity();
  const { currentUser } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Re-authenticate user to verify password
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
      setLocked(false);
    } catch (err) {
      console.error(err);
      setError("Incorrect password. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-95">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold text-center text-gray-800">App Locked</h2>
        <p className="mt-2 text-center text-gray-600">Please enter your password to unlock.</p>
        
        {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded border border-red-300">{error}</div>}

        <form onSubmit={handleUnlock} className="mt-6">
          <div>
            <label className="block text-gray-700">Password</label>
            <input
              type="password"
              className="w-full px-4 py-2 mt-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 mt-6 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none disabled:opacity-50"
          >
            {loading ? "Unlocking..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LockScreen;
