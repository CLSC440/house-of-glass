import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA_oTePhmWmzuOcZDmc_-7bhoAVbYVhH3Q",
    authDomain: "houseofglass-440.firebaseapp.com",
    projectId: "houseofglass-440"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    try {
        const snap = await getDocs(collection(db, 'products'));
        const docs = snap.docs.map(d => ({id: d.id, ...d.data()}));
        const aquatics = docs.filter(d => String(d.name || d.title).toLowerCase().includes('aquatic') || String(d.name || d.title).includes('اكواتيك'));
        console.log(`Found ${aquatics.length} Aquatic products:`);
        aquatics.forEach(aq => {
            console.log("Name:", aq?.name || aq?.title);
            console.log("desc:", aq?.desc);
            console.log("description:", aq?.description);
            console.log("---");
        });
    } catch(e) {
        console.error(e);
    }
}
check();
check();