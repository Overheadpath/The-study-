import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const [statusMessage, setStatusMessage] = useState("Connecting to backend...");

  useEffect(() => {
    const helloWorldApi = async () => {
      try {
        const response = await axios.get(`${API}/`);
        const mode = response.data?.storage_mode || "unknown";
        setStatusMessage(`Backend connected (${mode} mode)`);
      } catch (error) {
        console.error(error, "errored out requesting /api");
        setStatusMessage("Backend unavailable. Check that backend server is running.");
      }
    };

    helloWorldApi();
  }, []);

  return (
    <div>
      <header className="App-header">
        <a
          className="App-link"
          href="https://emergent.sh"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://avatars.githubusercontent.com/in/1201222?s=120&u=2686cf91179bbafbc7a71bfbc43004cf9ae1acea&v=4"
            alt="Study Helper logo"
          />
        </a>
        <p className="mt-5">Building something incredible ~!</p>
        <p>{statusMessage}</p>
      </header>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
