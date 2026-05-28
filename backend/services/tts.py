"""
Minimal Edge TTS helper — called by tts.js.
Reads JSON from stdin: {"text":"...", "voice":"zh-CN-YunxiNeural", "speed":1.0}
Prints output MP3 path to stdout on success.
Prints ERROR message to stderr on failure.
"""
import sys, json, tempfile, os, asyncio
import edge_tts

async def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            raise RuntimeError("Empty stdin")
        args = json.loads(raw)
        text = args.get("text", "").strip()
        voice = args.get("voice", "zh-CN-YunxiNeural")
        speed = args.get("speed", 1.0)

        # Strip lone surrogates that can't be encoded in UTF-8
        text = text.encode("utf-8", errors="surrogateescape").decode("utf-8", errors="replace")

        if not text:
            raise RuntimeError("Empty text")

        rate_pct = round((speed - 1.0) * 100)
        rate = f"{rate_pct:+d}%"

        fd, tmp = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)

        communicate = edge_tts.Communicate(text, voice, rate=rate)
        with open(tmp, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])

        print(tmp, flush=True)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

asyncio.run(main())
