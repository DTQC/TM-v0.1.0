/**
 * ==========================================================================
 * TasteMatch Firebase Configuration & Cloud Firestore Synchronization
 * ==========================================================================
 * Connects web application to Firebase App, Authentication, and Cloud Firestore.
 * Provides real-time synchronization for community recipes, authentication state,
 * and handles offline resilience across devices and accounts.
 */

// Firebase Configuration (TasteMatch production credentials)
var firebaseConfig = {
  apiKey: "AIzaSyBL3Biadtd-vI3gFPaCevZBdiLLnRzG9Ag",
  authDomain: "tastematch-1f149.firebaseapp.com",
  projectId: "tastematch-1f149",
  storageBucket: "tastematch-1f149.firebasestorage.app",
  messagingSenderId: "300453693760",
  appId: "1:300453693760:web:74ecb9f9ebb75d53ef92a5",
  measurementId: "G-NFB1KPE6F3"
};

// Initialize Firebase App
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log('[TasteMatch] Firebase initialized successfully with project:', firebaseConfig.projectId);
  } catch (err) {
    console.error('[TasteMatch] Firebase initialization error:', err);
  }
}

// Global Auth reference
var auth = typeof firebase !== 'undefined' ? firebase.auth() : null;

// Initialize Firebase Cloud Firestore
var db = null;
if (typeof firebase !== 'undefined' && firebase.firestore) {
  try {
    db = firebase.firestore();
    // Enable offline persistence if supported in current browser session
    db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time
      } else if (err.code === 'unimplemented') {
        // The current browser does not support persistence
      }
    });
    console.log('[TasteMatch] Cloud Firestore database client initialized.');
  } catch (err) {
    console.warn('[TasteMatch] Firestore initialization notice:', err);
  }
}
window.db = db;
window.auth = auth;

// Synchronize Firebase auth state with localStorage for backwards compatibility across pages
if (auth) {
  auth.onAuthStateChanged((user) => {
    if (user) {
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
      localStorage.setItem('currentUser', displayName);
      localStorage.setItem('currentUserEmail', user.email || '');
      localStorage.setItem('currentUserId', user.uid);
      console.log('[TasteMatch] Auth state changed: Signed in as', displayName, '(' + user.uid + ')');
    } else {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentUserEmail');
      localStorage.removeItem('currentUserId');
      console.log('[TasteMatch] Auth state changed: Signed out.');
    }
    // Dispatch custom event for pages that listen
    window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
  });
}

// TasteMatch Community User Recipes Firestore Sync Manager
window.TasteMatchCommunity = {
  sync: function (onUpdate) {
    if (!db) {
      console.warn('[TasteMatch] Firestore db not available for community sync.');
      return null;
    }
    try {
      return db.collection('custom_recipes').onSnapshot((snapshot) => {
        const recipes = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          recipes.push({
            id: doc.id,
            name: d.name || '',
            category: d.category || 'Custom',
            image: d.image || '',
            difficulty: d.difficulty || 'Medium',
            mealType: d.mealType || 'Dish',
            instructions: d.instructions || '',
            userId: d.userId || '',
            authorName: d.authorName || '',
            timestamp: d.timestamp || Date.now()
          });
        });

        // Always update local storage cache with live cloud data
        if (recipes.length > 0) {
          localStorage.setItem('userRecipes', JSON.stringify(recipes));
        }

        // Notify callback and dispatch global update event
        if (typeof onUpdate === 'function') onUpdate(recipes);
        window.dispatchEvent(new CustomEvent('communityRecipesUpdated', { detail: { recipes } }));
      }, (err) => {
        if (err.message && err.message.includes('has not been used in project') || err.code === 'permission-denied') {
          console.warn('[TasteMatch Firebase Notice] Cloud Firestore database is pending activation in Firebase Console for project ' + firebaseConfig.projectId + '. Visit https://console.firebase.google.com/project/' + firebaseConfig.projectId + '/firestore to create database.');
        } else {
          console.warn('[TasteMatch] Community recipes sync notice:', err.message);
        }
      });
    } catch (e) {
      console.warn('[TasteMatch] Community recipes sync setup note:', e);
      return null;
    }
  },

  addRecipe: async function (recipeData) {
    const user = auth ? auth.currentUser : null;
    if (user) {
      recipeData.userId = user.uid;
      recipeData.authorName = user.displayName || (user.email ? user.email.split('@')[0] : 'Chef');
    } else {
      recipeData.userId = localStorage.getItem('currentUserId') || '';
      recipeData.authorName = localStorage.getItem('currentUser') || 'Community Chef';
    }
    recipeData.timestamp = Date.now();

    // Save to Firebase Cloud Firestore
    if (db) {
      try {
        recipeData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const docRef = await db.collection('custom_recipes').add(recipeData);
        recipeData.id = docRef.id;
        console.log('[TasteMatch] Custom recipe saved to Firestore successfully! ID:', docRef.id);
      } catch (err) {
        console.warn('[TasteMatch] Firestore custom recipe save notice:', err.message);
      }
    }

    // Always maintain local cache
    const local = JSON.parse(localStorage.getItem('userRecipes')) || [];
    local.unshift(recipeData);
    localStorage.setItem('userRecipes', JSON.stringify(local));
    window.dispatchEvent(new CustomEvent('communityRecipesUpdated', { detail: { recipes: local } }));
    return recipeData;
  },

  editRecipe: async function (recipeId, recipeData) {
    const user = auth ? auth.currentUser : null;
    const currentUid = user ? user.uid : localStorage.getItem('currentUserId');
    if (recipeData.userId && currentUid && recipeData.userId !== currentUid) {
      alert('Permission denied: You can only edit recipes that you originally created.');
      return false;
    }

    if (db && recipeId && !recipeId.startsWith('local_')) {
      try {
        await db.collection('custom_recipes').doc(recipeId).update({
          name: recipeData.name,
          category: recipeData.category,
          image: recipeData.image,
          difficulty: recipeData.difficulty,
          mealType: recipeData.mealType,
          instructions: recipeData.instructions,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[TasteMatch] Recipe updated in Firestore:', recipeId);
      } catch (err) {
        console.warn('[TasteMatch] Firestore custom recipe update notice:', err.message);
      }
    }

    const local = JSON.parse(localStorage.getItem('userRecipes')) || [];
    const idx = local.findIndex(r => r.id === recipeId);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...recipeData };
      localStorage.setItem('userRecipes', JSON.stringify(local));
      window.dispatchEvent(new CustomEvent('communityRecipesUpdated', { detail: { recipes: local } }));
    }
    return true;
  },

  deleteRecipe: async function (recipe, index) {
    const user = auth ? auth.currentUser : null;
    const currentUid = user ? user.uid : localStorage.getItem('currentUserId');
    if (recipe && recipe.userId && currentUid && recipe.userId !== currentUid) {
      alert('Permission denied: You can only delete recipes that you originally created.');
      return false;
    }

    if (db && recipe && recipe.id && !recipe.id.startsWith('local_')) {
      try {
        await db.collection('custom_recipes').doc(recipe.id).delete();
        console.log('[TasteMatch] Recipe deleted from Firestore:', recipe.id);
      } catch (err) {
        console.warn('[TasteMatch] Firestore custom recipe delete notice:', err.message);
      }
    }

    const local = JSON.parse(localStorage.getItem('userRecipes')) || [];
    let updated = [];
    if (recipe && recipe.id) {
      updated = local.filter(r => r.id !== recipe.id);
    } else if (typeof index === 'number') {
      local.splice(index, 1);
      updated = local;
    }
    localStorage.setItem('userRecipes', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('communityRecipesUpdated', { detail: { recipes: updated } }));
    return true;
  }
};

// Initialize community sync on page load
if (typeof window.TasteMatchCommunity !== 'undefined' && db) {
  window.TasteMatchCommunity.sync();
}
