/**
 * Import pages here
 * 
 */
import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import './App.css';

import Home from "./pages/Home";

function App() {
    return (
        <Router>
            <Routes>
                <Route element={<MainLayout />}>
                    <Route path="/" element={<Home />} />
                </Route>
            </Routes>
        </Router>
    )
}

export default App