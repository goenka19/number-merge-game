import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDovc5_CPorbl4SroCLH6D3kf4hXa5Mk1E",
  authDomain: "number-merge-d89e6.firebaseapp.com",
  projectId: "number-merge-d89e6",
  storageBucket: "number-merge-d89e6.firebasestorage.app",
  messagingSenderId: "737586447726",
  appId: "1:737586447726:web:7e79ea4735a8163dd2ad7f",
  measurementId: "G-179TZTQ2DY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
