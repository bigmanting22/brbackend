import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

def get_supabase_client():
    """Returns an authenticated Supabase client."""
    url = os.getenv("SUPABASE_URL") or ""
    key = os.getenv("SUPABASE_KEY") or ""
    return create_client(supabase_url=url, supabase_key=key)

# Optionally, you can add more utility functions here for querying or upserting documents if needed by your workflow.
