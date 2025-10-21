import { useEffect, useMemo, useRef, useState } from 'react'
import './Chat.css'
import { useAuth } from '../contexts/AuthContext'
import supabase from '../Supabase'

// Note: Using the Gemini API directly from the browser exposes your API key to users.
// For production, proxy requests through a server and keep the key private.
export default function Chat() {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  const { user } = useAuth()
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m your cooking assistant. Ask me for recipes, substitutions, meal ideas, or cooking tips. I can also add ingredients to your shopping list if you need!', isGreeting: true }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [functionStatus, setFunctionStatus] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  // Lazy-load SDK only when needed to keep initial bundle light
  const sdkPromiseRef = useRef(null)
  const chatRef = useRef(null)

  // Load chat history on mount
  useEffect(() => {
    if (user) {
      loadChatHistory()
    }
  }, [user])

  const loadChatHistory = async () => {
    try {
      setLoadingHistory(true)
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50) // Last 50 messages
      
      if (error) throw error
      
      if (data && data.length > 0) {
        const loadedMessages = data.map(msg => ({
          role: msg.role,
          text: msg.content,
          id: msg.id
        }))
        // Keep the greeting, then add loaded history
        setMessages(prev => [
          prev[0], // greeting
          ...loadedMessages
        ])
      }
    } catch (e) {
      console.error('Error loading chat history:', e)
    } finally {
      setLoadingHistory(false)
    }
  }

  const saveChatMessage = async (role, text) => {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          user_id: user.id,
          role,
          content: text
        }])
      
      if (error) throw error
    } catch (e) {
      console.error('Error saving chat message:', e)
    }
  }

  const clearChatHistory = async () => {
    if (!confirm('Clear all chat history? This cannot be undone.')) return
    
    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', user.id)
      
      if (error) throw error
      
      // Reset to just the greeting
      setMessages([
        { role: 'assistant', text: 'Hi! I\'m your cooking assistant. Ask me for recipes, substitutions, meal ideas, or cooking tips. I can also add ingredients to your shopping list if you need!', isGreeting: true }
      ])
      chatRef.current = null
    } catch (e) {
      console.error('Error clearing chat:', e)
      setError('Failed to clear chat history')
    }
  }

  const ensureSdk = async () => {
    if (!sdkPromiseRef.current) {
      sdkPromiseRef.current = import('@google/generative-ai').then(mod => mod)
    }
    return sdkPromiseRef.current
  }

  // Function declarations for Gemini to call
  const tools = [
    {
      functionDeclarations: [
         {
           name: 'get_pantry_items',
           description: 'Get all items currently in the user\'s pantry. Use this when the user asks what ingredients they have, what\'s in their pantry, or wants recipe suggestions based on available ingredients.',
           parameters: {
             type: 'object',
             properties: {},
             required: []
           }
         },
        {
          name: 'add_to_shopping_list',
          description: 'Add one or more items to the user\'s shopping list. Use this when the user asks to add ingredients they need to buy.',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                description: 'List of items to add to shopping list',
                items: {
                  type: 'object',
                  properties: {
                    ingredient_name: { type: 'string', description: 'Name of the ingredient' },
                    quantity: { type: 'string', description: 'Amount needed (e.g., "2", "1 lb")' },
                    unit: { type: 'string', description: 'Unit of measurement (e.g., "cups", "lbs", "pieces")' },
                    recipe_name: { type: 'string', description: 'Optional: recipe this is for' }
                  },
                  required: ['ingredient_name']
                }
              }
            },
            required: ['items']
          }
        },
        {
          name: 'add_to_pantry',
          description: 'Add one or more items to the user\'s pantry. Use this when the user mentions they have ingredients on hand.',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                description: 'List of items to add to pantry',
                items: {
                  type: 'object',
                  properties: {
                    ingredient_name: { type: 'string', description: 'Name of the ingredient' },
                    quantity: { type: 'string', description: 'Amount they have' },
                    unit: { type: 'string', description: 'Unit of measurement' },
                    category: { type: 'string', description: 'Optional category (e.g., "dairy", "produce")' }
                  },
                  required: ['ingredient_name']
                }
              }
            },
            required: ['items']
          }
        }
      ]
    }
  ]

  // Handle function calls from Gemini
  const handleFunctionCall = async (functionCall) => {
    const { name, args } = functionCall
    
  if (import.meta.env.DEV) console.log('Executing function:', name, 'with args:', args)
    setFunctionStatus(`Executing: ${name}...`)
    
     if (name === 'get_pantry_items') {
       setFunctionStatus('Checking your pantry...')
       try {
         const { data, error } = await supabase
           .from('pantry_items')
           .select('*')
           .eq('user_id', user.id)
           .order('created_at', { ascending: false })
       
         if (error) throw error
       
         if (!data || data.length === 0) {
           setFunctionStatus('✓ Pantry is empty')
           setTimeout(() => setFunctionStatus(''), 2000)
           return { 
             success: true, 
             items: [],
             message: 'Your pantry is currently empty. You can add items from the Pantry tab or ask me to add them!'
           }
         }
       
         const pantryList = data.map(item => ({
           name: item.ingredient_name,
           quantity: item.quantity || 'some',
           unit: item.unit || '',
           category: item.category || 'uncategorized'
         }))
       
         setFunctionStatus(`✓ Found ${data.length} items in pantry`)
         setTimeout(() => setFunctionStatus(''), 2000)
       
         return { 
           success: true, 
           items: pantryList,
           count: data.length,
           message: `Found ${data.length} items in your pantry`
         }
       } catch (e) {
         console.error('Failed to get pantry items:', e)
         setFunctionStatus('Error loading pantry')
         setTimeout(() => setFunctionStatus(''), 3000)
         return { error: 'Failed to load pantry items', details: e.message }
       }
     }
   
    if (name === 'add_to_shopping_list') {
      const { items } = args
      if (!items || !Array.isArray(items)) {
        console.error('Invalid items array:', items)
        setFunctionStatus('Error: Invalid items format')
        return { error: 'Invalid items format' }
      }
      
      setFunctionStatus(`Adding ${items.length} items to shopping list...`)
      const results = []
      let successCount = 0
      
      for (const item of items) {
        try {
          if (import.meta.env.DEV) console.log('Adding to shopping list:', item)
          const { data, error } = await supabase
            .from('shopping_list_items')
            .insert([{ 
              ingredient_name: item.ingredient_name,
              quantity: item.quantity || '',
              unit: item.unit || '',
              category: item.category || '',
              recipe_name: item.recipe_name || '',
              notes: '',
              user_id: user.id,
              checked: false
            }])
          
          if (error) {
            console.error('Supabase error:', error)
            throw error
          }
          if (import.meta.env.DEV) console.log('Successfully added:', item.ingredient_name)
          results.push(`✓ Added ${item.ingredient_name}`)
          successCount++
        } catch (e) {
          console.error('Failed to add item:', e)
          results.push(`✗ Failed to add ${item.ingredient_name}: ${e.message}`)
        }
      }
      setFunctionStatus(`✓ Added ${successCount}/${items.length} items`)
      setTimeout(() => setFunctionStatus(''), 3000)
      return { success: true, results: results.join(', ') }
    }
    
    if (name === 'add_to_pantry') {
      const { items } = args
      if (!items || !Array.isArray(items)) {
        console.error('Invalid items array:', items)
        setFunctionStatus('Error: Invalid items format')
        return { error: 'Invalid items format' }
      }
      
      setFunctionStatus(`Adding ${items.length} items to pantry...`)
      const results = []
      let successCount = 0
      
      for (const item of items) {
        try {
          if (import.meta.env.DEV) console.log('Adding to pantry:', item)
          const { data, error } = await supabase
            .from('pantry_items')
            .insert([{ 
              ingredient_name: item.ingredient_name,
              quantity: item.quantity || '',
              unit: item.unit || '',
              category: item.category || '',
              notes: '',
              user_id: user.id
            }])
          
          if (error) {
            console.error('Supabase error:', error)
            throw error
          }
          if (import.meta.env.DEV) console.log('Successfully added to pantry:', item.ingredient_name)
          results.push(`✓ Added ${item.ingredient_name} to pantry`)
          successCount++
        } catch (e) {
          console.error('Failed to add item:', e)
          results.push(`✗ Failed to add ${item.ingredient_name}: ${e.message}`)
        }
      }
      setFunctionStatus(`✓ Added ${successCount}/${items.length} items to pantry`)
      setTimeout(() => setFunctionStatus(''), 3000)
      return { success: true, results: results.join(', ') }
    }

    setFunctionStatus('')
    return { error: 'Unknown function' }
  }

  const ensureChat = async () => {
    const { GoogleGenerativeAI } = await ensureSdk()
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',  // Using 1.5 for better function calling
      tools,
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO'  // Let the model decide when to call functions
        }
      },
      systemInstruction: `You are a helpful cooking assistant for Recipe Wizard.

Primary capabilities:
1. Help with recipes, cooking questions, ingredient substitutions, and meal planning
2. Provide recipe ideas and detailed cooking instructions
3. Answer questions about ingredients, techniques, and nutrition
4. Suggest meals based on what users have or want to cook

Function calling rules - CRITICAL:
- You have TWO functions available: add_to_shopping_list and add_to_pantry
- When a user asks to "add", "put", or similar action words with ingredients + "shopping list", you MUST call add_to_shopping_list
- When a user asks to add ingredients to their "pantry", you MUST call add_to_pantry
- NEVER just respond with text saying you added items - you MUST actually invoke the function
- After the function executes, you'll receive results - use those to confirm what was added

Examples of when to call functions:
- "Add flour to my shopping list" → CALL add_to_shopping_list([{ingredient_name: "flour"}])
- "Put eggs and milk on my list" → CALL add_to_shopping_list([{ingredient_name: "eggs"}, {ingredient_name: "milk"}])
- "Add those ingredients to my shopping list" → CALL add_to_shopping_list with the previously mentioned ingredients

Be friendly and conversational. Answer cooking questions directly with knowledge.`
    })
    // Start a chat session - exclude the greeting from history since Gemini requires user to start
    const history = messages
      .filter(m => !m.isGreeting)
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }))
    chatRef.current = model.startChat({ history })
    return chatRef.current
  }

  const send = async () => {
    if (!apiKey) {
      setError('Missing VITE_GEMINI_API_KEY. Add it to your .env and restart the dev server.')
      return
    }
    if (!input.trim() || loading) return
    setError('')
    const userText = input.trim()
    setInput('')

    // Optimistic UI update
    setMessages(prev => [...prev, { role: 'user', text: userText }])
    setLoading(true)
    
    // Save user message
    await saveChatMessage('user', userText)

    try {
      const chat = chatRef.current || await ensureChat()
      let result = await chat.sendMessage(userText)
      let response = result.response
      
      if (import.meta.env.DEV) {
        console.log('=== GEMINI RESPONSE ===')
        console.log('Response candidates:', JSON.stringify(response.candidates, null, 2))
      }
      
      // Extract function call from the response structure
      const getFunctionCall = (response) => {
        const part = response.candidates?.[0]?.content?.parts?.[0]
        return part?.functionCall || null
      }
      
      // Handle function calls
      let functionCall = getFunctionCall(response)
      while (functionCall) {
        if (import.meta.env.DEV) {
          console.log('=== Function Call Detected ===')
          console.log('Function name:', functionCall.name)
          console.log('Function args:', JSON.stringify(functionCall.args, null, 2))
        }
        
        // Execute the function
        const functionResult = await handleFunctionCall(functionCall)
  if (import.meta.env.DEV) console.log('Function result:', functionResult)
        
        // Send the result back to Gemini
        result = await chat.sendMessage([{
          functionResponse: {
            name: functionCall.name,
            response: functionResult
          }
        }])
        response = result.response
  if (import.meta.env.DEV) console.log('=== Function Response Sent ===')
        
        // Check if there's another function call
        functionCall = getFunctionCall(response)
      }
      
      if (!getFunctionCall(response)) {
        if (import.meta.env.DEV) console.log('No function calls in this response')
      }
      
      const reply = response.text()
      setMessages(prev => [...prev, { role: 'model', text: reply }])
      
      // Save assistant message
      await saveChatMessage('model', reply)
    } catch (e) {
      console.error('Gemini chat error:', e)
      setError(e?.message || 'Failed to get a response. Try again.')
      // rollback last user message if desired, but we keep it for context
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  useEffect(() => {
    // Recreate chat when messages reset substantially or apiKey changes
    chatRef.current = null
  }, [apiKey])

  return (
    <>
      {/* Floating Chat Widget */}
      <div className={`chat-widget ${isExpanded ? 'expanded' : 'collapsed'}`}>
        {/* Chat Header/Toggle Button */}
        <div className="chat-widget-header" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="chat-widget-title">
            <span className="chat-icon">💬</span>
            <span>Cooking Assistant</span>
          </div>
          <button className="chat-toggle-btn" aria-label={isExpanded ? 'Minimize chat' : 'Expand chat'}>
            {isExpanded ? '−' : '+'}
          </button>
        </div>

        {/* Chat Content (only visible when expanded) */}
        {isExpanded && (
          <div className="chat-widget-content">
            {/* Warnings/Status */}
            {!apiKey && (
              <div className="chat-banner warn">Missing VITE_GEMINI_API_KEY in .env. Chat is disabled.</div>
            )}

            {loadingHistory && (
              <div className="chat-banner info">Loading your chat history...</div>
            )}

            {/* Chat Window */}
            <div className="chat-window">
              {messages.map((m, idx) => (
                <div key={idx} className={`msg ${m.role === 'user' ? 'user' : 'model'}`}>
                  <div className="bubble">
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="msg model"><div className="bubble">Thinking…</div></div>
              )}
            </div>

            {/* Error/Status Messages */}
            {error && <div className="chat-banner error">{error}</div>}
            {functionStatus && <div className="chat-banner info">{functionStatus}</div>}

            {/* Input Area */}
            <div className="chat-input-row">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about recipes, substitutions, tips..."
                rows={2}
              />
              <button onClick={send} disabled={!apiKey || loading || !input.trim()}>
                {loading ? '⋯' : '→'}
              </button>
            </div>

            {/* Clear Chat Button */}
            <button onClick={clearChatHistory} className="clear-chat-btn" title="Clear chat history">
              🗑️ Clear History
            </button>
          </div>
        )}
      </div>
    </>
  )
}
