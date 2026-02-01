import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAocB-xjAk8-xIIcDLjx72k9I8OK4jHVgE",
  authDomain: "tlord-1ab38.firebaseapp.com",
  databaseURL: "https://tlord-1ab38-default-rtdb.firebaseio.com",
  projectId: "tlord-1ab38",
  storageBucket: "tlord-1ab38.firebasestorage.app",
  messagingSenderId: "750743868519",
  appId: "1:750743868519:web:732b9ba46acda5096570c2",
  measurementId: "G-36YH771XFV"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
