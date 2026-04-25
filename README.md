<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CharityLink

CharityLink connects local donors and charities. Donors can post available items, charities can post needs, and both sides can chat.

## Tech Stack

- React + TypeScript + Vite
- Firebase Auth (Google sign-in)
- Firestore (posts, needs, chats)
- Firebase Storage (image uploads)

## Local Setup

**Prerequisites:** Node.js 18+

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local`.
3. Fill all `VITE_FIREBASE_*` values in `.env.local`.
4. Run development server:
   `npm run dev`

## Security Notes

- Do not commit real Firebase credentials to source control.
- Gemini API keys must stay server-side.
- Frontend calls backend endpoint (`POST /api/categorize`) for AI categorization.

## Current Project Structure

- `src/lib/firebase.ts`: Firebase initialization (Auth, Firestore, Storage)
- `src/components/CreatePost.tsx`: Post creation and image upload
- `src/components/Chat.tsx`: Chat list and message thread UI
- `src/contexts/AuthContext.tsx`: Auth state and profile bootstrap
- `firestore.rules`: Firestore security rules

## Next Implementation Step (Recommended)

Productionize backend AI categorization endpoint:

1. Current implementation: Vite middleware route in [server/categorizeRoute.ts](server/categorizeRoute.ts).
2. Keep `GEMINI_API_KEY` only in server environment (never `VITE_*`).
3. Route accepts `imageData` and `mimeType`, returns `{ category: string }`.
4. Built-in protections: payload limit and in-memory rate limiting.
5. For production hosting, move the same logic to a dedicated backend service (Cloud Function/Cloud Run) if your host does not execute Vite middleware.

## Validation Commands

- Type-check: `npm run lint`
- Build: `npm run build`
