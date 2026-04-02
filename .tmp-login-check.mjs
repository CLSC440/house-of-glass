import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, limit } from "firebase/firestore";
const firebaseConfig = { apiKey: "AIzaSyA_oTePhmWmzuOcZDmc_-7bhoAVbYVhH3Q", authDomain: "houseofglass-440.firebaseapp.com", projectId: "houseofglass-440" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const run = async () => {
  const userSnap = await getDocs(query(collection(db, 'users'), limit(3)));
  console.log('users sample', userSnap.docs.map(d => ({ id: d.id, username: d.data().username, phone: d.data().phone, authEmail: d.data().authEmail })));
  try {
    const dirSnap = await getDocs(query(collection(db, 'user_directory'), limit(5)));
    console.log('user_directory sample', dirSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (error) {
    console.log('user_directory error', error.code || error.message);
  }
};
run().catch(err => { console.error(err); process.exit(1); });
