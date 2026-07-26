const FIREBASE_SDK_VERSION = '12.16.0';
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

const firebaseConfig = {
  apiKey: 'AIzaSyBh5CRiPaBnKwQKT9wP3vGuluU_DQm8MqQ',
  authDomain: 'warehouse-knowledge-ai.firebaseapp.com',
  projectId: 'warehouse-knowledge-ai',
  storageBucket: 'warehouse-knowledge-ai.firebasestorage.app',
  messagingSenderId: '730649551612',
  appId: '1:730649551612:web:69c831d002ae154da92d79',
  measurementId: 'G-C69GCEW3VJ',
};

const RECAPTCHA_ENTERPRISE_SITE_KEY = '6Ld3IGUtAAAAAMsoHY_lwuI_XxjR2xwA2yKTsp1E';

const ADMIN_EMAIL = 'headwarehouse.brancheeline@gmail.com';

export type FirebaseUser = {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

type FirebaseModules = {
  appModule: Record<string, any>;
  appCheckModule: Record<string, any>;
  authModule: Record<string, any>;
  aiModule: Record<string, any>;
  app: any;
  auth: any;
};

let modulesPromise: Promise<FirebaseModules> | null = null;

const loadFirebase = async () => {
  if (modulesPromise) return modulesPromise;

  modulesPromise = (async () => {
    const [appModule, appCheckModule, authModule, aiModule] = await Promise.all([
      import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-app.js`),
      import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-app-check.js`),
      import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-auth.js`),
      import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-ai.js`),
    ]);

    const app = appModule.initializeApp(firebaseConfig);

    appCheckModule.initializeAppCheck(app, {
      provider: new appCheckModule.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });

    return {
      appModule,
      appCheckModule,
      authModule,
      aiModule,
      app,
      auth: authModule.getAuth(app),
    };
  })();

  return modulesPromise;
};

export const isAdminUser = (user: FirebaseUser | null) => {
  if (!user?.email) return false;
  return !ADMIN_EMAIL || user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
};

export const observeAuth = async (callback: (user: FirebaseUser | null) => void) => {
  const { authModule, auth } = await loadFirebase();
  return authModule.onAuthStateChanged(auth, (user: FirebaseUser | null) => callback(user));
};

export const signInAdmin = async () => {
  const { authModule, auth } = await loadFirebase();
  const provider = new authModule.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await authModule.signInWithPopup(auth, provider);
  const user = result.user as FirebaseUser;

  if (!isAdminUser(user)) {
    await authModule.signOut(auth);
    throw new Error('Akun Google ini tidak diizinkan sebagai admin.');
  }

  return user;
};

export const signOutAdmin = async () => {
  const { authModule, auth } = await loadFirebase();
  await authModule.signOut(auth);
};

export const generateArticleWithAI = async (prompt: string) => {
  const { aiModule, app, auth } = await loadFirebase();
  if (!auth.currentUser) throw new Error('Silakan masuk sebagai admin terlebih dahulu.');

  const ai = aiModule.getAI(app, { backend: new aiModule.GoogleAIBackend() });
  const model = aiModule.getGenerativeModel(ai, {
    model: 'gemini-3.5-flash',
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 4096,
    },
  });
  const result = await model.generateContent(prompt);
  return result.response.text() as string;
};
