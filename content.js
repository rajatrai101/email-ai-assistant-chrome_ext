/**
 * @file content.js
 * @description This script injects the AI reply functionality into the Gmail UI.
 */

console.log("Gmail AI Reply Assistant content script loaded.");

// --- Globals ---
// IMPORTANT: The user should add their Gemini API Key in the extension's popup.
let GEMINI_API_KEY = "";

// --- Main Initialization ---
// Load the API key from storage and then initialize the UI observer.
chrome.storage.sync.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
        GEMINI_API_KEY = result.geminiApiKey;
        console.log("API Key loaded successfully.");
        initializeObserver();
    } else {
        console.log("Gemini API Key not found. Please set it in the extension popup.");
        // We still run the observer, but functionality will be disabled until the key is set.
        initializeObserver();
    }
});


/**
 * The core of the extension. It watches for changes in the Gmail DOM
 * to detect when an email is opened, and then injects the button.
 */
function initializeObserver() {
    const observer = new MutationObserver((mutations, obs) => {
        // Find the main toolbar in an open email view. This is a common selector.
        const toolbar = document.querySelector('.G-tF');
        if (toolbar && !document.getElementById('ai-reply-button')) {
            console.log("Email view detected. Injecting button.");
            createAiButton(toolbar);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Creates and injects the "Suggest Reply" button into the Gmail UI.
 * @param {HTMLElement} parentElement - The element to append the button to.
 */
function createAiButton(parentElement) {
    const button = document.createElement('div');
    button.id = 'ai-reply-button';
    button.className = 'ai-button T-I J-J5-Ji T-I-Js-IF N-I-Js-IF ar7 L3';
    button.textContent = '✨ Suggest Reply';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('data-tooltip', 'Generate AI-powered reply suggestions');

    button.addEventListener('click', handleSuggestReplyClick);

    // Prepend to a container within the toolbar for better placement
    const buttonContainer = parentElement.querySelector('.G-tF-T-I');
    if (buttonContainer) {
        buttonContainer.prepend(button);
    } else {
        parentElement.prepend(button);
    }
}

/**
 * Handles the click event on the "Suggest Reply" button.
 */
function handleSuggestReplyClick() {
    if (!GEMINI_API_KEY) {
        alert("Please set your Gemini API Key in the extension's popup first!");
        return;
    }

    const emailContent = getEmailThreadText();
    if (!emailContent) {
        console.error("Could not extract email content.");
        showSuggestionsModal({ error: "Could not read the email thread content. The Gmail layout might have changed." });
        return;
    }

    showSuggestionsModal({ isLoading: true });
    generateReplies(emailContent);
}

/**
 * Scrapes the text content of the entire visible email thread.
 * @returns {string} The text of the email thread.
 */
function getEmailThreadText() {
    // Gmail uses various classes for message bodies. This selector targets common ones.
    // It's fragile and may break if Google updates Gmail's structure.
    const messageNodes = document.querySelectorAll('.a3s.aiL, .adP');
    if (messageNodes.length === 0) {
        console.warn("No message nodes found with selectors '.a3s.aiL, .adP'. Trying another selector.");
        // Fallback for different Gmail versions
        const fallbackNodes = document.querySelectorAll('div[data-message-id]');
        if (fallbackNodes.length > 0) {
            return Array.from(fallbackNodes).map(node => node.innerText).join('\n--- Next Message ---\n');
        }
        return null;
    }
    return Array.from(messageNodes).map(node => node.innerText).join('\n--- Next Message ---\n');
}

/**
 * Calls the Gemini API to generate reply suggestions.
 * @param {string} threadText - The text of the email thread.
 * @param {string} [userInstruction=""] - Optional instruction from the user.
 */
async function generateReplies(threadText, userInstruction = "") {
    const prompt =
        `You are a helpful email assistant. Your goal is to suggest 3 concise, professional, and distinct replies to the following email thread. The last message in the thread is the most recent one to reply to.

Format each reply with proper email structure:
1. Start with a salutation on its own line (e.g., "Hi [Name],")
2. Add a blank line after the salutation
3. Write the main content with appropriate paragraphs
4. Add a blank line before the closing
5. End with a closing and your name on separate lines (e.g., "Best regards,\nRajat")

${userInstruction ? `An important instruction from the user to guide your response: "${userInstruction}"` : ''}

Analyze the tone and context of the thread and generate appropriate responses.

--- EMAIL THREAD START ---
${threadText}
--- EMAIL THREAD END ---

Please provide the 3 suggestions in a JSON array of strings. Use \\n for newlines to create proper spacing.

Example format:
["Hi [Name],\\n\\nThank you for your email.\\n\\nBest regards,\\nRajat"]`;

    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "STRING"
                }
            }
        }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody.error.message}`);
        }

        const result = await response.json();
        const suggestionsText = result.candidates[0].content.parts[0].text;
        const suggestions = JSON.parse(suggestionsText);
        showSuggestionsModal({ suggestions });

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        showSuggestionsModal({ error: error.message });
    }
}


/**
 * Creates and displays a modal to show loading state, suggestions, or errors.
 * @param {object} state - The state to render in the modal.
 * @param {boolean} [state.isLoading] - Show loading indicator.
 * @param {string[]} [state.suggestions] - Array of suggestion strings.
 * @param {string} [state.error] - Error message to display.
 */
function showSuggestionsModal(state) {
    // Remove existing modal if any
    const existingModal = document.getElementById('ai-suggestion-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'ai-suggestion-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'ai-modal-content';

    const closeButton = document.createElement('span');
    closeButton.className = 'ai-modal-close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => modal.remove();
    modalContent.appendChild(closeButton);

    const title = document.createElement('h2');
    title.textContent = 'AI Reply Suggestions';
    modalContent.appendChild(title);

    if (state.isLoading) {
        const loader = document.createElement('div');
        loader.className = 'ai-loader';
        loader.textContent = 'Generating ideas...';
        modalContent.appendChild(loader);
    } else if (state.error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'ai-error-message';
        errorDiv.textContent = `An error occurred: ${state.error}`;
        modalContent.appendChild(errorDiv);
    } else if (state.suggestions) {
        // Optional user input field
        const instructionContainer = document.createElement('div');
        instructionContainer.className = 'ai-instruction-container';

        const instructionInput = document.createElement('input');
        instructionInput.type = 'text';
        instructionInput.id = 'ai-user-instruction';
        instructionInput.placeholder = 'Optional: Add a note to refine (e.g., "be more formal")';

        const refineButton = document.createElement('button');
        refineButton.textContent = 'Refine';
        refineButton.className = 'ai-refine-button';

        refineButton.onclick = () => {
            const instruction = instructionInput.value;
            if (instruction) {
                const emailContent = getEmailThreadText();
                modalContent.querySelector('.ai-suggestions-list').innerHTML = '<div class="ai-loader">Regenerating with your note...</div>';
                generateReplies(emailContent, instruction);
            }
        };

        instructionContainer.appendChild(instructionInput);
        instructionContainer.appendChild(refineButton);
        modalContent.appendChild(instructionContainer);

        const list = document.createElement('div');
        list.className = 'ai-suggestions-list';
        state.suggestions.forEach(text => {
            const item = document.createElement('div');
            item.className = 'ai-suggestion-item';
            // Use innerHTML to render line breaks
            item.innerHTML = text.replace(/\n/g, '<br>');
            item.onclick = () => {
                insertReply(text);
                modal.remove();
            };
            list.appendChild(item);
        });
        modalContent.appendChild(list);
    }

    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

/**
 * Inserts the selected suggestion into the active Gmail reply box.
 * @param {string} text - The text to insert.
 */
function insertReply(text) {
    console.log("Inserting reply text:", text);
    const replyBox = document.querySelector('div[aria-label="Message Body"]');
    if (replyBox) {
        // Create a temporary div with pre-wrap style to preserve formatting
        const tempDiv = document.createElement('div');
        tempDiv.style.whiteSpace = 'pre-wrap';

        // Process the text - convert escaped newlines to actual newlines
        const processedText = text
            .replace(/\\n/g, '\n')  // Convert escaped newlines to actual newlines
            .replace(/\n/g, '<br>'); // Convert newlines to line breaks

        // Set the content
        tempDiv.innerHTML = processedText;

        // Focus the reply box and insert the formatted content
        replyBox.focus();
        replyBox.innerHTML = ''; // Clear existing content
        replyBox.innerHTML = tempDiv.innerHTML;

        // Move cursor to the end
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(replyBox);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        console.error("Could not find the Gmail reply box.");
        alert("Could not find the reply box to insert the text.");
    }
}

// Listen for messages from the popup (e.g., when the API key is updated)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateApiKey") {
        GEMINI_API_KEY = request.apiKey;
        console.log("API Key updated via popup.");
        sendResponse({ status: "success" });
    }
});
