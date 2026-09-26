import PocketBase from "pocketbase";

export const AUTH_COLLECTION = "users";

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL || "https://pb1.madebynz.xyz");
