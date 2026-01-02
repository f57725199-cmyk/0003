import React, { useState } from "react";
import { db } from "../firebase";
import { collectionGroup, getDocs, query, where, Timestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const AdminDashboard = () => {
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const handleDownload = async () => {
    if (!selectedDate) {
      alert("Please select a date.");
      return;
    }

    setLoading(true);
    try {
      // Create start and end timestamps for the selected date
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);

      const startTimestamp = Timestamp.fromDate(start);
      const endTimestamp = Timestamp.fromDate(end);

      // Query all 'messages' subcollections
      const messagesQuery = query(
        collectionGroup(db, "messages"),
        where("createdAt", ">=", startTimestamp),
        where("createdAt", "<=", endTimestamp)
      );

      const snapshot = await getDocs(messagesQuery);
      const allMessages = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        allMessages.push({
          id: doc.id,
          text: data.text || "[Media/File]",
          senderId: data.senderId,
          createdAt: data.createdAt?.toDate().toISOString(),
          type: data.type || "text",
          url: data.url || ""
        });
      });

      if (allMessages.length === 0) {
        alert("No messages found for this date.");
        setLoading(false);
        return;
      }

      // Generate JSON file
      const blob = new Blob([JSON.stringify(allMessages, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `chat_history_${selectedDate}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Error fetching messages:", error);
      alert("Failed to download chats. Ensure Firestore indexes are enabled for Collection Group queries on 'createdAt'.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="flex items-center justify-between mb-8">
        <button onClick={() => navigate("/")} className="text-blue-600 font-bold">&larr; Back to Home</button>
        <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
      </header>

      <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Daily Chat Archiver</h2>
        <p className="text-gray-600 mb-4 text-sm">Select a date to download all chat messages exchanged on that day.</p>

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">Select Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <button
          onClick={handleDownload}
          disabled={loading}
          className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Archiving..." : "Download Chat History"}
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;
