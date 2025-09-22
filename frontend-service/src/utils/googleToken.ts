// src/utils/googleToken.ts

// Decode a JWT (the Google ID token) safely in the browser
export function parseJwt<T = any>(token: string): T {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(jsonPayload);
}

// Google serves profile photos with a size param like =s96-c; bump it up
export function upscaleGooglePhoto(url: string, size = 128): string {
  // Handles URLs with or without =sXX-c
  if (url.includes("=s") && url.includes("-c")) {
    return url.replace(/=s\d+-c/, `=s${size}-c`);
  }
  // Append size if not present
  return url + (url.includes("?") ? "&" : "?") + `sz=${size}`;
}
