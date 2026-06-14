import React from 'react'
import { createRoot } from 'react-dom/client'
import HotkeyPopover from './HotkeyPopover.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HotkeyPopover />
  </React.StrictMode>
)
