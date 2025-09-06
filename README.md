# STAN-RIYAZ-Chatbot
A lightweight AI-powered chat application with persistent memory and tone-aware responses, built with Express.js and Google's Gemini AI.

--->Features
   AI-powered responses using Google's Gemini AI

   Clean, WhatsApp-inspired chat interface

   Automatic tone detection (empathetic, playful, neutral)

   Persistent memory using SQLite database

   User-specific memory and conversation history

--->Quick Start
Prerequisites
Node.js (v14 or higher)

npm or yarn

Local Installation
Clone the repository

--->Install dependencies:

bash
npm install
Set your Gemini API key:

bash
export MY_API_KEY=your_api_key_here
Start the server:

bash
npm start
Open http://localhost:3000 in your browser

--->Project Structure

stan-chat-assistant/

├── data/
│   └── memory.db           # SQLite database (auto-created)

├── frontend/
│   └── index.html          # Chat interface

├── server/
│   ├── index.js            # Express server with AI integration

│   ├── package.json        # Dependencies

│   ├── package-lock.json   # Locked dependencies

│   └── node_modules/       # Dependencies (auto-created)

    
--->Usage
Enter a User ID (or use 'guest')

Type your message in the input field

The assistant will respond with context-aware replies

The system remembers personal details like your name across sessions

--->Configuration
The application will work without an API key using simulated responses. For full functionality, obtain a Google Gemini API key and set it as the MY_API_KEY environment variable.

API Reference
POST /chat - Send a message and receive AI response

GET /memory/:user_id - View stored facts for a user
