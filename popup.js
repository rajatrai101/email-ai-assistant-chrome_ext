document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('save');
    const statusDiv = document.getElementById('status');

    // Load any saved API key and display it
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
    });

    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        if (apiKey) {
            chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
                statusDiv.textContent = 'API Key saved successfully!';
                
                // Notify the active content script
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    // Find the Gmail tab
                    const gmailTab = tabs.find(tab => tab.url.includes("mail.google.com"));
                    if (gmailTab) {
                        chrome.tabs.sendMessage(gmailTab.id, {action: "updateApiKey", apiKey: apiKey}, function(response) {
                            if (chrome.runtime.lastError) {
                                // This can happen if the content script isn't injected yet. It's okay.
                                console.log("Could not send message to content script. It might not be loaded yet.");
                            } else {
                                console.log(response.status);
                            }
                        });
                    }
                });

                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 3000);
            });
        }
    });
});
