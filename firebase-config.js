// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"; // <-- ここを12.0.0に修正
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCOwm093uxwJAc6KnVfSItEZfJhxKEsMCQ",
    authDomain: "jinrou-db3bb.firebaseapp.com",
    projectId: "jinrou-db3bb",
    storageBucket: "jinrou-db3bb.firebasestorage.app",
    messagingSenderId: "687405978579",
    appId: "1:687405978579:web:92b61785d529966a0e5526"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
