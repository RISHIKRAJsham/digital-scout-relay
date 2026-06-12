// Drop your exact API key here
const API_KEY = "AIzaSyCo4dMg9oHn5U-roqeia_joEEloPOhtOF0"; 

async function checkModels() {
    try {
        console.log("🔍 Checking Google servers for approved models...");
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        
        if (data.error) {
            console.log("\n❌ API KEY ERROR:", data.error.message);
            console.log("💡 Fix: You might have generated a standard Google Cloud key instead of a Google AI Studio key.");
            return;
        }
        
        console.log("\n✅ YOUR KEY IS VALID! Here is the exact list of models your key has access to:");
        data.models.forEach(m => {
            // Only print text-generation models to keep it clean
            if (m.name.includes("gemini") && m.supportedGenerationMethods.includes("generateContent")) {
                console.log(`- ${m.name}`);
            }
        });
        
    } catch (err) {
        console.log("\n❌ NETWORK ERROR: Failed to reach Google.", err);
    }
}

checkModels();