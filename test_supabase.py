from dotenv import load_dotenv
load_dotenv()
from supab import get_supabase_client

client = get_supabase_client()
try:
    response = client.table("documents").select("*").limit(1).execute()
    print("Supabase test result:", response)
except Exception as e:
    print("Supabase connection failed:", e)
