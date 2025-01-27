"""
RAG-based CV improvement tool for Windows.

Steps:
1. Ingest a PDF CV, extract text, and store embeddings in a local FAISS index.
2. Retrieve relevant chunks for questions asked to GPT.
3. Collect suggestions and improvements from GPT.
4. Generate a new CV text incorporating improvements.
5. Convert the updated CV text back to a PDF file.

Usage (from Command Prompt or PowerShell):
    python rag_cv_tool.py <path_to_cv_pdf> [output_pdf_name]

Example:
    python rag_cv_tool.py my_resume.pdf Improved_CV.pdf
"""

import os
import sys
import openai
import PyPDF2
import faiss
import numpy as np

#########################
# 1) CONFIG / CONSTANTS #
#########################

# Either set your OpenAI API key as an environment variable:
#   set OPENAI_API_KEY=your_api_key
# or replace "YOUR_OPENAI_API_KEY" below with your actual key.
openai.api_key = os.getenv("OPENAI_API_KEY", "UPDATE_YOUR_KEY_FROM_HERE")

# Embedding model and LLM model
EMBEDDING_MODEL = "text-embedding-ada-002"    # or any other OpenAI embedding model
CHAT_MODEL      = "gpt-4"            # or "gpt-4", etc.

# Dimensions for "text-embedding-ada-002" is 1536
EMBED_DIMENSION = 1536

####################################
# 2) PDF EXTRACTION & TEXT CHUNKING #
####################################

def extract_text_from_pdf(pdf_path):
    """
    Extract text from a PDF file using PyPDF2.
    """
    text = ""
    with open(pdf_path, 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        for page_num in range(len(pdf_reader.pages)):
            page = pdf_reader.pages[page_num]
            text += page.extract_text() + "\n"
    return text


def chunk_text(text, chunk_size=1000, overlap=200):
    """
    Splits text into chunks of `chunk_size` characters with `overlap` characters overlapping.
    """
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += (chunk_size - overlap)
    return chunks

##########################################
# 3) EMBEDDINGS & VECTOR STORE (FAISS)   #
##########################################

def generate_embeddings(text_chunks, engine=EMBEDDING_MODEL):
    """
    Generate embeddings for each chunk of text using the OpenAI Embeddings API.
    """
    embeddings = []
    for chunk in text_chunks:
        response = openai.Embedding.create(input=chunk, engine=engine)
        embeddings.append(response["data"][0]["embedding"])
    return embeddings


def store_embeddings_faiss(chunks, embeddings, dimension=EMBED_DIMENSION):
    """
    Create a FAISS index with the given embeddings and return the index.
    Also return a dictionary mapping index ID to the chunk text.
    """
    index = faiss.IndexFlatL2(dimension)
    embedding_matrix = np.array(embeddings).astype('float32')
    index.add(embedding_matrix)
    id_to_chunk = {i: chunk for i, chunk in enumerate(chunks)}
    return index, id_to_chunk


def retrieve_relevant_chunks(query, faiss_index, id_to_chunk, top_k=3, engine=EMBEDDING_MODEL):
    """
    Given a query, embed it, and retrieve the top_k relevant chunks from the FAISS index.
    """
    response = openai.Embedding.create(input=query, engine=engine)
    query_embedding = response["data"][0]["embedding"]
    query_vector = np.array([query_embedding]).astype('float32')
    
    distances, indices = faiss_index.search(query_vector, top_k)
    relevant_chunks = [id_to_chunk[idx] for idx in indices[0]]
    return relevant_chunks

##############################################
# 4) ASK GPT WITH RETRIEVED CONTEXT CHUNKS   #
##############################################

def ask_gpt_with_context(query, context_chunks, model=CHAT_MODEL):
    """
    Send a query and relevant context to GPT, and return the GPT response.
    """
    context_str = "\n\n".join(context_chunks)
    system_prompt = (
        "You are a CV review expert. "
        "Provide feedback based on the context below, highlighting best parts and improvements.\n\n"
        f"Context:\n{context_str}\n\n"
        "User Query: "
    )
    
    completion = openai.ChatCompletion.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ],
        max_tokens=1000,
        temperature=0.7
    )
    
    return completion.choices[0].message["content"]


#########################################
# 5) CREATE UPDATED CV USING GPT OUTPUT #
#########################################

def create_updated_cv(original_cv_text, improvements, additional_prompts, model=CHAT_MODEL):

    """
    Prompt GPT to rewrite the CV in HTML format incorporating the suggested improvements.
    The resulting HTML can include headings, bullet points, bold text, etc.
    """
    print(additional_prompts);
    prompt = (
        
        f"Below is the original CV, followed by a list of improvements and the job title. Expand the important details based on your knowledge from job title and use bold and italic items to show which parts are highlights. "
        "Please rewrite the CV **in full HTML** format, applying the improvements, "
        "using headings (e.g. <h2>, <h3>), bold for key achievements, and bullet points where appropriate. Please double check that all of the information in the main CV is covered."
        "Ensure the final output is well-organized, professional, and styled to highlight important sections.\n\n"
        f"Original CV:\n{original_cv_text}\n\n"
        f"Improvements:\n{improvements}\n\n"
        f"Job Title:\n{additional_prompts}\n\n"
        "Your output should be valid HTML containing the fully updated CV. "
        "Do not include any additional commentary—only the HTML.Don't leave any part for users to complete or finish, give brushed up latest version."
    )
    
    completion = openai.ChatCompletion.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=2000
    )
    return completion.choices[0].message["content"]

####################################
# 6) CONVERT UPDATED CV TEXT TO PDF #
####################################

# Option A: Using WeasyPrint
try:
    from weasyprint import HTML
    
    def text_to_pdf(html_content, pdf_output_path="updated_cv.pdf"):
        """
        Convert HTML to PDF using WeasyPrint.
        """
        # We assume 'html_content' is already valid HTML.
        HTML(string=html_content).write_pdf(pdf_output_path)
        return pdf_output_path

except ImportError:
    # Option B: If WeasyPrint is not available, fallback to pdfkit or something else.
    import pdfkit
    
    def text_to_pdf(html_content, pdf_output_path="updated_cv.pdf"):
        """
        Fallback PDF conversion using pdfkit (requires wkhtmltopdf and pdfkit installed).
        """
        pdfkit.from_string(html_content, pdf_output_path)
        return pdf_output_path

##################################
# 7) MAIN WORKFLOW / ENTRY POINT #
##################################

def main(cv_pdf_path, additional_prompts, output_pdf_path="Improved_CV.pdf" ):
    """
    Main function to orchestrate the CV ingestion, retrieval, GPT Q&A, and final PDF generation.
    """
    print(f"Processing CV PDF: {cv_pdf_path}")

    # Step 1: Read PDF and extract text
    cv_text = extract_text_from_pdf(cv_pdf_path)
    print("Extracted text from PDF.")

    # Step 2: Chunk text
    text_chunks = chunk_text(cv_text, chunk_size=1000, overlap=200)
    
    # Step 3: Generate embeddings and store them in FAISS
    embeddings = generate_embeddings(text_chunks)
    faiss_index, id_to_chunk = store_embeddings_faiss(text_chunks, embeddings)
    
    # Step 4: Ask GPT for the best parts of the CV
    question_best_parts = "What are the best parts of this CV?"
    relevant_chunks_best = retrieve_relevant_chunks(question_best_parts, faiss_index, id_to_chunk)
    best_parts = ask_gpt_with_context(question_best_parts, relevant_chunks_best)
    print("\n--- BEST PARTS ---")
    print(best_parts)

    # Step 5: Ask GPT for improvements
    question_improvements = "How can I improve this CV for a software engineering role?"
    relevant_chunks_imp = retrieve_relevant_chunks(question_improvements, faiss_index, id_to_chunk)
    improvements = ask_gpt_with_context(question_improvements, relevant_chunks_imp)
    print("\n--- SUGGESTED IMPROVEMENTS ---")
    print(improvements)

    # Step 6: Generate a new version of the CV text using GPT
    updated_cv_text = create_updated_cv(cv_text, improvements, additional_prompts)
    print("\n--- UPDATED CV TEXT ---")
    print(updated_cv_text)

    # Step 7: Convert the updated CV text back to a PDF
    final_pdf_path = text_to_pdf(updated_cv_text, pdf_output_path=output_pdf_path)
    print(f"\nUpdated CV PDF generated at: {final_pdf_path}")


if __name__ == "__main__":
    # Example usage:
    #   python rag_cv_tool.py my_resume.pdf
    # or
    #   python rag_cv_tool.py my_resume.pdf Improved_CV.pdf
    if len(sys.argv) < 2:
        print("Usage: python rag_cv_tool.py <path_to_cv_pdf> [output_pdf_name]")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_pdf = sys.argv[2]
    additional_prompts = sys.argv[3] 
    
    main(pdf_path,additional_prompts, output_pdf)