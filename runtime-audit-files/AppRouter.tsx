import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainApp from '../pages/MainApp';

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  );
};