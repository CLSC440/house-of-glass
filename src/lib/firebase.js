import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA_oTePhmWmzuOcZDmc_-7bhoAVbYVhH3Q",
    authDomain: "houseofglass-440.firebaseapp.com",
    projectId: "houseofglass-440",
    storageBucket: "houseofglass-440.firebasestorage.app",
    messagingSenderId: "73082039144",
    appId: "1:73082039144:web:0658e54416293334dc84dd",
    measurementId: "G-S81YY4Z4RM"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider };
