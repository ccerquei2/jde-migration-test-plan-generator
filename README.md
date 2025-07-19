# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set your API keys in [.env.local](.env.local):
   - `OPENAI_API_KEY` ou `GROQ_API_KEY`
   - `GEMINI_API_KEY` (opcional)
   - `LLM_PROVIDER` (`openai`, `groq` ou `gemini`)
   - `TOP_MODEL_PWD` (opcional para liberar modelos premium)
3. Run the app:
   `npm run dev`
