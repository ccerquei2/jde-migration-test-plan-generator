# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Create a `.env.local` file and set your provider credentials:
   - `LLM_PROVIDER` selects the LLM service (`openai`, `groq`, or `gemini`).
   - Provide only the API key for that provider (`OPENAI_API_KEY`, `GROQ_API_KEY`, or `GEMINI_API_KEY`).
   - Premium model IDs (`o3`, `o4`, `gpt-4.1`, `gpt-4.5`) also require the `TOP_MODEL_PWD` variable.
   - Você pode trocar o provedor pela combobox **Modelo LLM** na tela principal.
3. Run the app:
   `npm run dev`