"use client";

import { useEffect } from "react";

const ZINTO_WEBCHAT_TOKEN = "wc_d7ec7a925ad39141150cfd40f68367407329048ada6d04e9";

export function ZintoWebChat() {
  useEffect(() => {
    // Load Zinto WebChat script
    const script = document.createElement("script");
    script.src = `https://crm.zinto.app/api/webchat/widget.js?token=${ZINTO_WEBCHAT_TOKEN}`;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script if component unmounts
      document.body.removeChild(script);
    };
  }, []);

  return null;
}
