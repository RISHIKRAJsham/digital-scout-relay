// sessionManager.js
const crypto = require('crypto');

class SessionManager {
    constructor() {
        this.sessions = new Map();
    }

    getOrCreateSession(identifier) {
        if (this.sessions.has(identifier)) {
            return this.sessions.get(identifier);
        }
        
        // Create a unique session ID for the pipeline
        const newSession = {
            sessionId: crypto.randomUUID(),
            identifier: identifier,
            state: 'IDLE',
            createdAt: Date.now()
        };
        
        this.sessions.set(identifier, newSession);
        return newSession;
    }

    updateSessionState(identifier, newState) {
        if (this.sessions.has(identifier)) {
            const session = this.sessions.get(identifier);
            session.state = newState;
            session.updatedAt = Date.now();
            this.sessions.set(identifier, session);
        }
    }

    getSession(identifier) {
        return this.sessions.get(identifier);
    }
}

// Export a single instance so the whole server shares the same memory
module.exports = new SessionManager();