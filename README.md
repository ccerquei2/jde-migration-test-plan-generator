# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key. You can optionally set `LLM_PROVIDER` to `openai`, `groq` or `gemini` to define the default provider.
3. Run the app:
   `npm run dev`
4. In the UI, choose the desired LLM provider from the dropdown before generating a test plan.
