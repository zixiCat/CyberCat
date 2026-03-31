# Bilibili / BBDown

Recommended local workflow:

1. Open `CyberCat -> Settings -> Bilibili`.
2. Set the **Bilibili URL** (space or favourites link) and sign in with **QR Login** (or paste an existing `BBDown.data` value).
3. Save settings. The cookie and URL are stored in CyberCat's local config, not in this repository.
4. Run BBDown through the helper script so the cookie is injected at runtime.

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

Avoid committing local auth artifacts such as `BBDown.data`, `BBDownTV.data`, `BBDownApp.data`, or `qrcode.png` in this folder.
