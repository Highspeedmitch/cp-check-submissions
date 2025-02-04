import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, VStack, Input, Button, Text, Link } from "native-base"; // ✅ Import NativeBase components

function Login({ setUser }) {
  const [email, setEmail] = useState("");  
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleLogin = async () => {
    try {
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      });

      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (response.ok) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("orgName", data.orgName || "Your Organization");
          localStorage.setItem("role", data.role || "user");
          localStorage.setItem("loginTime", new Date().toISOString());
          setUser(true);
          navigate("/dashboard");
        } else {
          alert(data.message);
        }
      } catch (jsonError) {
        console.error("❌ Unexpected response:", text);
        alert("Unexpected server response. Please try again.");
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      alert("Server error. Please try again.");
    }
  };

  return (
    <Box flex={1} justifyContent="center" alignItems="center" bg="coolGray.100" p={5}>
      <VStack space={4} w="90%" maxW="400px" bg="white" p={5} borderRadius={10} shadow={2}>
        <Text fontSize="xl" fontWeight="bold" textAlign="center">
          Login
        </Text>
        {error && <Text color="red.500">{error}</Text>}

        {/* Email Input */}
        <Input
          variant="outline"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          size="md"
        />

        {/* Password Input */}
        <Input
          variant="outline"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          size="md"
          type="password"
        />

        {/* Login Button */}
        <Button onPress={handleLogin} colorScheme="primary" size="lg">
          Login
        </Button>

        {/* Forgot Password Link */}
        <Link alignSelf="center" onPress={() => navigate("/forgot-password")} _text={{ color: "blue.500" }}>
          Forgot Password?
        </Link>

        {/* Register Button */}
        <Button variant="outline" onPress={() => navigate("/register")} size="md">
          Register
        </Button>
      </VStack>
    </Box>
  );
}

export default Login;
