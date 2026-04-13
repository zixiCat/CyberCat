# Bilibili / BBDown

Recommended local workflow:

1. Open `CyberCat -> Settings -> Bilibili`.
2. Set the **Bilibili URL** (space or favourites link), sign in with **QR Login** (or paste an existing `BBDown.data` value), and edit **BBDown Config** if you want custom BBDown options.
3. Save settings. The cookie, URL, and BBDown config are stored in CyberCat's local config, not in this repository.
4. Run BBDown through the helper script so the cookie is injected and the saved BBDown config is written to a local runtime file.

From the repository root (uses the URL stored in settings when no argument is given):

```sh
uv run apps/service/src/scripts/bilibili/run_bbdown.py
```

Or pass a URL explicitly:

```sh
uv run apps/service/src/scripts/bilibili/run_bbdown.py "https://space.bilibili.com/7825867/favlist?fid=68978567"
```

If your Python environment is already active and you are inside this folder:

```sh
python run_bbdown.py
```

CyberCat no longer keeps a tracked `BBDown.config` in this folder. Use the Bilibili settings page instead.

Avoid committing local auth artifacts such as `BBDown.data`, `BBDownTV.data`, `BBDownApp.data`, or `qrcode.png` in this folder.
