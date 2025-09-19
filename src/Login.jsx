import { useState } from "react";
import "./LoginPage.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";


const LoginPage = () => {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleLogin = (e) => {
        e.preventDefault();
        if (!email || !password) {
            return setError("Please fill all required fields!");
        }

        if (email === "admin@gmail.com" && password === "Admin@123") {
            window.sessionStorage.setItem("user", JSON.stringify({ email }));
            toast.success("Login success");
            setTimeout(() => {
                const newSessionId = Math.random().toString(36).substring(2, 8);
                window.location.href = `?role=magician&session=${newSessionId}`;
            }, 1000); // 1 second delay
        } else {
            setError("Invalid email or password");
        }
    };

    return (
        <>

            <div className="login-container">
                <div className="login-box">
                    <h2>Magician Login</h2>
                    <form onSubmit={handleLogin}>
                        {error && <p className="error-text">{error}</p>}

                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                            />
                        </div>

                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                            />
                        </div>

                        <button type="submit" className="login-button">
                            Login
                        </button>
                    </form>
                </div>
            </div>
            <ToastContainer position="top-right" autoClose={5000} />
        </>
    );
};

export default LoginPage;
