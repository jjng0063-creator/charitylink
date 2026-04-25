# CharityLink

CharityLink is a community donation and needs-matching application. Users can post donation items, request needed items, browse nearby listings, manage their own posts, and chat with other users.

## Current Features

- Google sign-in with Firebase Authentication.
- Donation post creation with image upload.
- Needs post creation with priority levels.
- Home donation feed with location-priority display.
- Needs feed with location-priority and priority-based ordering.
- Category, location, and needs-priority filters.
- Donation and needs details pages with exact posted date/time.
- Chat between users with unread notification support.
- Realtime user presence status using Firebase Realtime Database.
- Profile dashboard with donation and needs counts.
- Manage Donations module with edit, delete, image gallery, request analysis, and hide/show visibility controls.
- Manage Needs module with edit, delete, priority updates, and hide/show visibility controls.
- Account Settings page for updating display name and default location.

## Tech Stack

- React
- TypeScript
- Vite
- Firebase Authentication
- Firestore
- Firebase Storage
- Firebase Realtime Database
- Tailwind CSS
- Capacitor-ready web build path for Android APK packaging

## Local Setup

Prerequisite: Node.js 18 or newer.

1. Install dependencies:

```powershell
npm install
```

2. Copy `.env.example` to `.env.local`.

3. Fill in the Firebase environment values in `.env.local`.

4. Run the development server:

```powershell
npm run dev
```

5. Open the local URL shown in the terminal.

## Firebase Setup

This project uses:

- Firebase Auth for Google sign-in.
- Firestore for users, posts, needs, chats, and messages.
- Firebase Storage for donation images.
- Firebase Realtime Database for online/offline presence.

Firebase rule files included in this project:

- `firestore.rules`
- `database.rules.json`

After changing these rule files, deploy or manually update the rules in Firebase Console.

## Environment Variables

Use `.env.example` as the template.

Important values:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_URL
```

Do not commit `.env.local`.

## AI Category Suggestion

The AI category suggestion code is present but currently disabled in `src/components/CreatePost.tsx`.

Current setting:

```ts
const ENABLE_AI_CATEGORY_SUGGESTION = false;
```

If re-enabled, the app calls the backend endpoint:

```text
POST /api/categorize
```

The server-side route is located at:

```text
server/categorizeRoute.ts
```

For production or APK builds, this endpoint should be deployed to a real backend service such as Firebase Functions or Cloud Run.

## Android APK Notes

The app can be wrapped into an Android APK using Capacitor.

General flow:

```powershell
npm run build
npx cap sync android
npx cap open android
```

For Google sign-in in an APK, add an Android app in Firebase Console, configure the package name, add SHA-1/SHA-256 fingerprints, and download `google-services.json` into:

```text
android/app/google-services.json
```

## Project Structure

```text
src/
  components/
    AccountSettings.tsx
    Chat.tsx
    CreatePost.tsx
    Header.tsx
    ManageNeeds.tsx
    ManagePosts.tsx
    NeedDetails.tsx
    PostCard.tsx
    PostDetails.tsx
    Profile.tsx
  contexts/
    AuthContext.tsx
  lib/
    categories.ts
    firebase.ts
    gemini.ts
    utils.ts
  App.tsx
  main.tsx

server/
  categorizeRoute.ts
```

## Validation Commands

Type-check:

```powershell
npm run lint
```

Production build:

```powershell
npm run build
```

## Security Notes

- Do not commit `.env.local`.
- Do not expose private API keys in frontend variables.
- Keep Gemini API keys server-side only.
- Deploy updated Firebase rules whenever `firestore.rules` or `database.rules.json` changes.
