import { useState } from 'react'
import './App.css'

function App() {
  const [email, setEmail] = useState('')
  const [files, setFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    const pdfFiles = selectedFiles.filter(file => file.type === 'application/pdf')
    setFiles(pdfFiles)
  }

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        // Remove the data:application/pdf;base64, prefix
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email || files.length === 0) {
      alert('Please provide email and select at least one PDF file')
      return
    }

    setIsUploading(true)

    try {
      // Convert all PDF files to base64
      const base64Files = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          content: await convertToBase64(file)
        }))
      )

      // Send to API
      const apiUrl = import.meta.env.VITE_PROCESS_RESUME_API_URL
      if (!apiUrl) {
        throw new Error('API URL not configured')
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          files: base64Files
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      alert('We will email you our report soon!')
      setEmail('')
      setFiles([])
      e.target.reset()
    } catch (error) {
      alert('Upload failed: ' + error.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="container">
      <h1>Resume Upload</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email *</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="files">PDF Files *</label>
          <input
            id="files"
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={handleFileChange}
            required
          />
          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, index) => (
                <div key={index} className="file-item">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="submit" disabled={isUploading}>
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </div>
  )
}

export default App
