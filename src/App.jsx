import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Meet from './meet'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    <div>Meet</div>
      <Meet/>
    </>
  )
}

export default App
