"""Local development entry point. Uses long-polling so you can test
the bot end-to-end without ngrok or a public webhook.

    cd skill && python dev.py
"""

from __future__ import annotations

import logging

from telegram_bot import build_application

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def main() -> None:
    application = build_application()
    print("Polling for messages. Press Ctrl-C to stop.")
    application.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    main()
