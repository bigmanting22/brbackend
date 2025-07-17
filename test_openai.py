from dotenv import load_dotenv
load_dotenv()
import os
from openai import OpenAI

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)
try:
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": "Say hello!"}]
    )
    print("OpenAI test result:", response.choices[0].message.content)
except Exception as e:
    print("OpenAI connection failed:", e)
