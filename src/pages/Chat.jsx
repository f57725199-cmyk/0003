import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, storage } from "../firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
  where,
  deleteDoc,
  getDocs,
  setDoc,
  getDoc,
  arrayUnion
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, uploadString } from "firebase/storage";
import { useAuth } from "../context/AuthContext";
import { v4 as uuidv4 } from "uuid";
import VideoCall from "../components/VideoCall";

const Chat = () => {
  const { userId } = useParams();
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const [friend, setFriend] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const navigate = useNavigate();
  const bottomRef = useRef(null);
  
  // Admin Check (Hardcoded for demo, or based on user property)
  const isAdmin = currentUser?.email?.includes("admin"); 

  // Generate a unique chat ID based on user IDs (sorted to ensure consistency)
  const chatId = currentUser.uid > userId 
    ? `${currentUser.uid}-${userId}` 
    : `${userId}-${currentUser.uid}`;

  useEffect(() => {
    // Fetch friend details
    const unsubscribeFriend = onSnapshot(doc(db, "users", userId), (doc) => {
        if (doc.exists()) {
            setFriend(doc.data());
        }
    });

    // Fetch chat wallpaper
    const unsubscribeChat = onSnapshot(doc(db, "chats", chatId), (doc) => {
        if (doc.exists() && doc.data().wallpaperUrl) {
            setWallpaperUrl(doc.data().wallpaperUrl);
        }
    });

    // Listen for call signaling
    const unsubscribeCall = onSnapshot(doc(db, "chats", chatId, "call", "signaling"), (snapshot) => {
        const data = snapshot.data();
        if (data?.offer && !isInCall && !isCaller) {
             // Incoming call detected
             const accept = window.confirm("Incoming Video Call from " + (friend?.displayName || "Friend") + ". Accept?");
             if (accept) {
                 setIsCaller(false);
                 setIsInCall(true);
             } else {
                 // Reject logic (clear doc)
                 deleteDoc(doc(db, "chats", chatId, "call", "signaling"));
             }
        } else if (!data && isInCall) {
            // Call ended remotely
            setIsInCall(false);
            setIsCaller(false);
        }
    });

    // Listener for messages
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Only show message if NOT hidden for current user
        if (!data.hiddenFor || !data.hiddenFor.includes(currentUser.uid)) {
            msgs.push({ id: doc.id, ...data });
        }
      });
      setMessages(msgs);
      
      // Mark unseen messages as seen immediately upon loading or receiving
      msgs.forEach(async (msg) => {
          if (msg.senderId !== currentUser.uid && !msg.seen) {
             try {
                const msgRef = doc(db, "chats", chatId, "messages", msg.id);
                await updateDoc(msgRef, { seen: true });
             } catch (e) {
                 console.error("Error marking seen:", e);
             }
          }
      });
    });

    return () => {
        unsubscribeFriend();
        unsubscribeChat();
        unsubscribeMsgs();
        unsubscribeCall();
    };
  }, [chatId, currentUser.uid, userId, isInCall, isCaller, friend]);

  // Handle "Disappearing Messages" on unmount / navigate back
  useEffect(() => {
     return () => {
         const hideSeenMessages = async () => {
             try {
                // Query for messages sent to me that are seen AND NOT SAVED
                const qSeen = query(
                    collection(db, "chats", chatId, "messages"),
                    where("senderId", "==", userId), // Message from the other person
                    where("seen", "==", true)
                );
                
                const snapshot = await getDocs(qSeen);
                const updatePromises = [];
                snapshot.forEach((d) => {
                    const data = d.data();
                    if (!data.saved) {
                        // Instead of delete, update hiddenFor array
                        updatePromises.push(updateDoc(d.ref, {
                            hiddenFor: arrayUnion(currentUser.uid)
                        }));
                    }
                });
                await Promise.all(updatePromises);
             } catch (error) {
                 console.error("Error hiding seen messages:", error);
             }
         };
         hideSeenMessages();
     }
  }, [chatId, userId, currentUser.uid]); 
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text && !file) return;

    setLoading(true);
    setUploadProgress(0);

    try {
      let url = null;
      let type = "text";
      let fileName = "";

      if (file) {
        const fileRef = ref(storage, `chat/${chatId}/${uuidv4()}`);
        const uploadTask = uploadBytesResumable(fileRef, file);
        fileName = file.name;

        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          }, 
          (error) => {
             console.error("Upload failed", error);
             setLoading(false);
          }, 
          async () => {
            url = await getDownloadURL(uploadTask.snapshot.ref);
            if (file.type.startsWith("image/")) {
                type = "image";
            } else if (file.type.startsWith("video/")) {
                type = "video";
            } else {
                type = "file";
            }
            
            await sendMessage(text, url, type, fileName);
            setLoading(false);
            setUploadProgress(0);
            setText("");
            setFile(null);
          }
        );
        return; // Return here as async task continues in callback
      } else {
          await sendMessage(text, null, "text", "");
          setText("");
          setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const sendMessage = async (msgText, mediaUrl, msgType, fileName) => {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: msgText,
        senderId: currentUser.uid,
        createdAt: Timestamp.now(),
        seen: false,
        saved: false,
        hiddenFor: [],
        ...(mediaUrl && { url: mediaUrl, type: msgType, fileName }),
      });
  };
  
  const handleFileChange = (e) => {
      if (e.target.files[0]) {
          setFile(e.target.files[0]);
      }
  }

  const handleWallpaperChange = async (e) => {
      const wallpaperFile = e.target.files[0];
      if (!wallpaperFile) return;

      try {
          const fileRef = ref(storage, `chat/${chatId}/wallpaper_${uuidv4()}`);
          await uploadBytesResumable(fileRef, wallpaperFile);
          const url = await getDownloadURL(fileRef);
          
          await setDoc(doc(db, "chats", chatId), { wallpaperUrl: url }, { merge: true });
      } catch (err) {
          console.error("Error setting wallpaper:", err);
      }
  };

  const toggleSave = async (msgId, currentStatus) => {
      const msgRef = doc(db, "chats", chatId, "messages", msgId);
      await updateDoc(msgRef, { saved: !currentStatus });
  };

  const deleteMessage = async (msgId, isSaved) => {
      if (isSaved) {
          alert("Cannot delete a saved message. Unsave it first.");
          return;
      }
      const msgRef = doc(db, "chats", chatId, "messages", msgId);
      await deleteDoc(msgRef);
  };
  
  const restoreChats = async () => {
      try {
          const q = query(collection(db, "chats", chatId, "messages"));
          const snapshot = await getDocs(q);
          const updatePromises = [];
          
          snapshot.forEach((d) => {
              const data = d.data();
              if (data.hiddenFor && data.hiddenFor.length > 0) {
                  updatePromises.push(updateDoc(d.ref, { hiddenFor: [] }));
              }
          });
          
          await Promise.all(updatePromises);
          alert("Chats restored!");
      } catch (err) {
          console.error("Error restoring chats", err);
      }
  };

  const convertToPic = async (msg) => {
      if (!msg.url) return;
      try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = 300;
          canvas.height = 200;
          
          if (msg.type === "video") {
               const video = document.createElement("video");
               video.crossOrigin = "anonymous";
               video.src = msg.url;
               video.muted = true;
               
               await new Promise((resolve, reject) => {
                   video.onloadeddata = () => {
                       video.currentTime = 1; 
                   };
                   video.onseeked = () => resolve();
                   video.onerror = (e) => reject(e);
               });
               
               ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          } else {
              // Generic File
              ctx.fillStyle = "#f3f4f6";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = "#1f2937";
              ctx.font = "20px Arial";
              ctx.fillText("Converted File:", 20, 50);
              ctx.font = "16px Arial";
              ctx.fillText(msg.fileName || "File", 20, 80);
          }
          
          const dataUrl = canvas.toDataURL("image/png");
          const fileRef = ref(storage, `chat/${chatId}/converted_${uuidv4()}.png`);
          await uploadString(fileRef, dataUrl, 'data_url');
          const newUrl = await getDownloadURL(fileRef);
          
          const msgRef = doc(db, "chats", chatId, "messages", msg.id);
          await updateDoc(msgRef, {
              url: newUrl,
              type: "image",
              originalType: msg.type 
          });
          
      } catch (e) {
          console.error("Conversion failed", e);
          alert("Conversion failed.");
      }
  };

  const startVideoCall = () => {
      setIsCaller(true);
      setIsInCall(true);
  };

  const endVideoCall = () => {
      setIsInCall(false);
      setIsCaller(false);
  };

  const formatLastSeen = (timestamp) => {
      if (!timestamp) return "Offline";
      const date = timestamp.toDate();
      const now = new Date();
      const diff = Math.floor((now - date) / 1000); 

      if (diff < 60) return "Online";
      if (diff < 3600) return `Last seen ${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `Last seen ${Math.floor(diff / 3600)}h ago`;
      return `Last seen ${date.toLocaleDateString()}`;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 relative">
      {/* Background Wallpaper Layer */}
      {wallpaperUrl && (
          <div 
            className="absolute inset-0 z-0 opacity-40 bg-cover bg-center pointer-events-none"
            style={{ backgroundImage: `url(${wallpaperUrl})` }}
          />
      )}

      {isInCall && (
          <VideoCall 
             chatId={chatId} 
             currentUser={currentUser} 
             isCaller={isCaller} 
             endCall={endVideoCall} 
          />
      )}

      <header className="bg-blue-600 p-2 text-white flex items-center justify-between shadow-md z-10 relative">
        <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="font-bold text-xl px-2">
            &larr;
            </button>
            
            {friend && (
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gray-300 overflow-hidden">
                        {friend.photoURL ? (
                            <img src={friend.photoURL} alt="DP" className="h-full w-full object-cover" />
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-gray-600 font-bold text-xs">
                                {friend.displayName?.charAt(0) || friend.email?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h1 className="text-sm font-bold leading-tight">{friend.displayName || friend.email}</h1>
                        <p className="text-xs text-blue-200">{formatLastSeen(friend.lastSeen)}</p>
                    </div>
                </div>
            )}
        </div>
        
        <div className="flex items-center gap-2">
             <button onClick={startVideoCall} className="bg-blue-800 p-2 rounded-full hover:bg-blue-900" title="Video Call">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                 </svg>
             </button>
             <button onClick={restoreChats} className="bg-green-600 px-2 py-1 rounded text-xs hover:bg-green-700">
                 Restore Chat
             </button>
             {friend?.location && (
                 <a 
                    href={`https://www.google.com/maps?q=${friend.location.lat},${friend.location.lng}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="p-2 bg-blue-700 rounded-full hover:bg-blue-800"
                    title="View Location"
                 >
                     📍
                 </a>
             )}
             <label className="cursor-pointer text-xs bg-blue-700 hover:bg-blue-800 px-3 py-1 rounded flex items-center">
                 <span>Wallpaper</span>
                 <input type="file" className="hidden" onChange={handleWallpaperChange} accept="image/*" />
             </label>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 z-10 relative">
        {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-lg relative ${isMe ? "bg-blue-500 text-white" : "bg-white text-gray-800"}`}>
                        {msg.type === "image" && (
                            <img src={msg.url} alt="Shared" className="rounded mb-2 max-h-64 object-cover" />
                        )}
                        {msg.type === "video" && (
                            <video src={msg.url} controls className="rounded mb-2 max-h-64" />
                        )}
                        {msg.type === "file" && (
                             <div className="flex items-center gap-2 p-2 bg-gray-100 rounded text-black">
                                 <span className="text-2xl">📄</span>
                                 <a href={msg.url} target="_blank" rel="noreferrer" className="underline truncate max-w-[150px]">
                                     {msg.fileName || "Download File"}
                                 </a>
                             </div>
                        )}
                        {msg.text && <p>{msg.text}</p>}
                        
                        <div className="flex items-center justify-end mt-1 gap-2 flex-wrap">
                             {/* Admin Convert Button */}
                             {isAdmin && (msg.type === "video" || msg.type === "file") && (
                                 <button
                                     onClick={() => convertToPic(msg)}
                                     className="text-xs bg-purple-600 text-white px-1 rounded hover:bg-purple-700"
                                     title="Convert to Pic"
                                 >
                                     Convert
                                 </button>
                             )}

                             {/* Save Button */}
                             <button 
                                onClick={() => toggleSave(msg.id, msg.saved)}
                                className={`text-xs ${msg.saved ? "text-yellow-400 font-bold" : "text-gray-400 hover:text-yellow-300"}`}
                                title={msg.saved ? "Unsave" : "Save to prevent deletion"}
                             >
                                 {msg.saved ? "★ Saved" : "☆"}
                             </button>

                             {/* Delete Button (Sender only) */}
                             {isMe && (
                                 <button 
                                    onClick={() => deleteMessage(msg.id, msg.saved)}
                                    className="text-xs text-red-300 hover:text-red-100"
                                    title="Delete for everyone"
                                 >
                                     🗑
                                 </button>
                             )}

                            <div className={`text-xs ${isMe ? "text-blue-200" : "text-gray-400"}`}>
                                {isMe && (
                                    <span>
                                        {msg.seen ? (
                                            <span className="text-green-300 font-bold">✓✓</span>
                                        ) : (
                                            <span>✓</span>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t flex items-center gap-2 z-10 relative">
         <label className="cursor-pointer text-gray-500 hover:text-blue-600">
             <input type="file" className="hidden" onChange={handleFileChange} accept="*/*" />
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
             </svg>
         </label>
         {file && (
             <div className="text-xs bg-gray-200 px-2 py-1 rounded flex items-center">
                 {file.name.substring(0, 10)}...
                 <button type="button" onClick={() => setFile(null)} className="ml-1 text-red-500 font-bold">x</button>
             </div>
         )}
         <input 
            type="text" 
            value={text} 
            onChange={e => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
         />
         <button type="submit" disabled={loading} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 min-w-[40px] flex justify-center">
             {loading && uploadProgress > 0 ? (
                 <span className="text-xs font-bold">{Math.round(uploadProgress)}%</span>
             ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
             )}
         </button>
      </form>
    </div>
  );
};

export default Chat;
