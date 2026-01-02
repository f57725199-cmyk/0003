import React, { useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, collection, addDoc } from "firebase/firestore";
import { useSecurity } from "../context/SecurityContext";

const VideoCall = ({ chatId, currentUser, isCaller, endCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Initializing...");
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  
  const { isLocked } = useSecurity();

  // STUN servers
  const servers = {
    iceServers: [
      {
        urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
      },
    ],
  };

  // Auto-end call if app is locked
  useEffect(() => {
      if (isLocked) {
          handleEndCall();
      }
  }, [isLocked]);

  useEffect(() => {
    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection(servers);
        peerConnectionRef.current = pc;

        // Add tracks
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Handle remote stream
        pc.ontrack = (event) => {
          setRemoteStream(event.streams[0]);
          if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        const callDocRef = doc(db, "chats", chatId, "call", "signaling");
        const callerCandidatesCol = collection(callDocRef, "callerCandidates");
        const calleeCandidatesCol = collection(callDocRef, "calleeCandidates");

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
             const candidateCol = isCaller ? callerCandidatesCol : calleeCandidatesCol;
             addDoc(candidateCol, event.candidate.toJSON());
          }
        };

        if (isCaller) {
             setConnectionStatus("Calling...");
             // Create Offer
             const offerDescription = await pc.createOffer();
             await pc.setLocalDescription(offerDescription);
             
             const offer = {
                 sdp: offerDescription.sdp,
                 type: offerDescription.type,
             };

             await setDoc(callDocRef, { offer });

             // Listen for answer
             const unsubscribeSignaling = onSnapshot(callDocRef, (snapshot) => {
                 const data = snapshot.data();
                 if (pc.signalingState !== "stable" && data?.answer) {
                     const answerDescription = new RTCSessionDescription(data.answer);
                     pc.setRemoteDescription(answerDescription);
                     setConnectionStatus("Connected");
                 }
             });

             // Listen for remote candidates
             const unsubscribeCandidates = onSnapshot(calleeCandidatesCol, (snapshot) => {
                 snapshot.docChanges().forEach((change) => {
                     if (change.type === "added") {
                         const candidate = new RTCIceCandidate(change.doc.data());
                         pc.addIceCandidate(candidate);
                     }
                 });
             });
             
             return () => {
                 unsubscribeSignaling();
                 unsubscribeCandidates();
             }

        } else {
            setConnectionStatus("Connecting...");
            // Callee Logic
            const unsubscribeSignaling = onSnapshot(callDocRef, async (snapshot) => {
                const data = snapshot.data();
                if (!pc.currentRemoteDescription && data?.offer) {
                    setConnectionStatus("Answering...");
                    const offerDescription = new RTCSessionDescription(data.offer);
                    await pc.setRemoteDescription(offerDescription);
                    
                    const answerDescription = await pc.createAnswer();
                    await pc.setLocalDescription(answerDescription);
                    
                    const answer = {
                        type: answerDescription.type,
                        sdp: answerDescription.sdp
                    };
                    
                    await updateDoc(callDocRef, { answer });
                    setConnectionStatus("Connected");
                }
            });

             // Listen for remote candidates
             const unsubscribeCandidates = onSnapshot(callerCandidatesCol, (snapshot) => {
                 snapshot.docChanges().forEach((change) => {
                     if (change.type === "added") {
                         const candidate = new RTCIceCandidate(change.doc.data());
                         pc.addIceCandidate(candidate);
                     }
                 });
             });

             return () => {
                 unsubscribeSignaling();
                 unsubscribeCandidates();
             }
        }

      } catch (err) {
        console.error("Error starting video call:", err);
        setConnectionStatus("Error: " + err.message);
      }
    };

    const cleanup = startCall();

    return () => {
       // Cleanup logic is handled by handleEndCall usually, but also on unmount
       if (peerConnectionRef.current) {
           peerConnectionRef.current.close();
       }
       if (localStream) {
           localStream.getTracks().forEach(track => track.stop());
       }
       // if (typeof cleanup === 'function') cleanup(); // startCall is async, returns Promise
    };
  }, [chatId, isCaller]); // Removed localStream/refs dependencies to avoid loops

  const handleEndCall = async () => {
      // Stop tracks
      if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
      }
      
      // Clear signaling doc to signal end
      try {
        await deleteDoc(doc(db, "chats", chatId, "call", "signaling"));
      } catch (e) { 
          // console.error(e); 
      }
      
      endCall();
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
      <div className="absolute top-4 left-4 text-white z-10 bg-black bg-opacity-50 px-2 rounded">
          <p>{connectionStatus}</p>
      </div>
      
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      
      <div className="absolute bottom-20 right-4 w-32 h-48 bg-gray-800 border-2 border-white rounded overflow-hidden">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
      </div>

      <div className="absolute bottom-8 z-10">
          <button 
            onClick={handleEndCall}
            className="bg-red-600 rounded-full p-4 hover:bg-red-700 focus:outline-none shadow-lg"
            title="End Call"
          >
             <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.75 18 6m0 0 2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m-10.5-2.118c.956-1.554 2.652-2.316 4.318-1.53.518.243 1.144.157 1.583-.223a.75.75 0 0 1 .536-.217h6a.75.75 0 0 1 .536.217L21 2.25m-9 0 2.25 2.25m0 0 2.25-2.25M12 2.25l-2.25 2.25m-1.5-1.5 2.25 2.25m-2.25-2.25L9 2.25" />
             </svg>
          </button>
      </div>
    </div>
  );
};

export default VideoCall;
