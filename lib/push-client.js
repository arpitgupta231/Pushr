export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getPushPermissionState() {
  try {
    if (!isPushSupported()) {
      return "unsupported";
    }
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

export async function subscribeToPush() {
  try {
    if (!isPushSupported()) {
      return { ok: false, reason: "unsupported" };
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const keyResponse = await fetch("/api/push/public-key");
    if (!keyResponse.ok) {
      return { ok: false, reason: "server" };
    }
    const { publicKey } = await keyResponse.json();
    if (!publicKey) {
      return { ok: false, reason: "server" };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "denied" };
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    });

    if (!response.ok) {
      return { ok: false, reason: "server" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function unsubscribeFromPush() {
  try {
    if (!isPushSupported()) {
      return { ok: true };
    }

    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) {
      return { ok: true };
    }

    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      try {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch {}
      try {
        await sub.unsubscribe();
      } catch {}
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
