"""Vanadis Bord -- desktop AI chat application."""

import webview


HTML = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Vanadis Bord</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    height: 100vh;
    display: flex;
  }
  #sidebar {
    width: 260px;
    background: #16213e;
    border-right: 1px solid #2a2a4a;
    display: flex;
    flex-direction: column;
    padding: 16px;
  }
  #sidebar h1 {
    font-size: 18px;
    font-weight: 600;
    color: #7b8cde;
    margin-bottom: 16px;
  }
  #sidebar h1 span { color: #4a5a9a; }
  #sessions { flex: 1; overflow-y: auto; }
  #sessions .session {
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 4px;
    font-size: 13px;
    color: #a0a0c0;
  }
  #sessions .session:hover { background: #1a1a3e; }
  #sessions .session.active { background: #2a2a5e; color: #fff; }
  #new-session-btn {
    padding: 10px;
    background: #2a2a5e;
    border: 1px solid #3a3a6e;
    border-radius: 8px;
    color: #7b8cde;
    cursor: pointer;
    font-size: 13px;
    text-align: center;
    margin-top: 8px;
  }
  #new-session-btn:hover { background: #3a3a6e; }
  #main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  #chat {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }
  #chat .message {
    margin-bottom: 16px;
    max-width: 80%;
  }
  #chat .message.user {
    margin-left: auto;
    background: #2a2a5e;
    padding: 12px 16px;
    border-radius: 12px 12px 4px 12px;
  }
  #chat .message.assistant {
    background: #1e1e3a;
    padding: 12px 16px;
    border-radius: 12px 12px 12px 4px;
  }
  #chat .welcome {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #4a5a9a;
    font-size: 24px;
    font-weight: 300;
  }
  #input-area {
    padding: 16px 24px;
    border-top: 1px solid #2a2a4a;
    display: flex;
    gap: 8px;
  }
  #input-area textarea {
    flex: 1;
    background: #16213e;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    color: #e0e0e0;
    padding: 12px;
    font-size: 14px;
    font-family: inherit;
    resize: none;
    outline: none;
    min-height: 44px;
    max-height: 200px;
  }
  #input-area textarea:focus { border-color: #7b8cde; }
  #input-area button {
    background: #7b8cde;
    border: none;
    border-radius: 8px;
    color: #fff;
    padding: 0 20px;
    cursor: pointer;
    font-size: 14px;
  }
  #input-area button:hover { background: #8b9cee; }
</style>
</head>
<body>
  <div id="sidebar">
    <h1>Vanadis <span>Bord</span></h1>
    <div id="sessions">
      <div class="session active">Welcome</div>
    </div>
    <div id="new-session-btn">+ New Session</div>
  </div>
  <div id="main">
    <div id="chat">
      <div class="welcome">Vanadis Bord</div>
    </div>
    <div id="input-area">
      <textarea placeholder="Type a message..." rows="1"></textarea>
      <button>Send</button>
    </div>
  </div>
</body>
</html>
"""


def main():
    window = webview.create_window(
        "Vanadis Bord",
        html=HTML,
        width=1200,
        height=800,
        min_size=(800, 600),
    )
    webview.start(debug=True)


if __name__ == "__main__":
    main()
