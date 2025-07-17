import os
from dotenv import load_dotenv
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from supabase import create_client

load_dotenv()

docs = [
    "LangGraph is a framework for building stateful, multi-agent workflows with LLMs.",
    "Supabase is an open-source backend-as-a-service that provides a vector store and PostgreSQL.",
    "Streamlit is a Python library for creating simple web apps for data science and ML workflows."
]

def embed_documents():
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    table_name = os.getenv("TABLE_NAME", "documents")

    client = create_client(supabase_url, supabase_key)
    embeddings = OpenAIEmbeddings()

    vectorstore = SupabaseVectorStore.from_texts(
        texts=docs,
        embedding=embeddings,
        client=client,
        table_name=table_name
    )

    print("✅ Successfully embedded docs to Supabase vector DB")

embed_documents()
