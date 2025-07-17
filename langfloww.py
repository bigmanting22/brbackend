from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from openai import OpenAI
from supab import get_supabase_client
import os

# Set up OpenAI API key from environment
import dotenv
dotenv.load_dotenv()

openai_api_key = os.getenv("OPENAI_API_KEY")


def rag_chain(query, top_k=3):
    """
    RAG pipeline: embed query, retrieve docs, call LLM, return answer and context.
    Returns (answer, context_chunks)
    """
    # 1. Embed the query
    embeddings = OpenAIEmbeddings()
    query_embedding = embeddings.embed_query(query)

    # 2. Retrieve top-k docs from Supabase
    client = get_supabase_client()
    table_name = os.getenv("TABLE_NAME", "documents")
    vectorstore = SupabaseVectorStore(
        client=client,
        embedding=embeddings,
        table_name=table_name
    )
    docs = vectorstore.similarity_search(query, k=top_k)
    context_chunks = [doc.page_content for doc in docs]

    # 3. Call OpenAI LLM with context
    prompt = (
    """You are a helpful assistant with strict access control.\n
    Only use the information provided in the context below to answer the user's question.\n
    - Do not guess or generate information not present in the context.\n
    - If the answer is not in the context, clearly respond: I couldn’t find that information in the provided documents.\n
    - Do not refer to yourself or mention that you are an AI model.\n
    - Keep the answer factual, concise, and directly based on the retrieved content."""

        f"Context:\n{chr(10).join(context_chunks)}\n"
        f"Question: {query}\nAnswer:"
    )
    openai_client = OpenAI(api_key=openai_api_key)
    response = openai_client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}]
    )
    answer = None
    if response and hasattr(response, 'choices') and response.choices:
        message = response.choices[0].message
        if message and hasattr(message, 'content') and message.content:
            answer = message.content.strip()
    if not answer:
        answer = "Sorry, I couldn't generate an answer."

    return answer, context_chunks
