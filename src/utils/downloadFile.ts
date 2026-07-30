/**
 * Download a file from a URL using XHR to avoid Next.js router interception
 * @param url - The URL of the file to download
 * @param filename - The filename to save as
 * @returns Promise that resolves when download completes or rejects on error
 */
export async function downloadFile(
  url: string,
  filename: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "blob";

    xhr.onload = function () {
      if (xhr.status === 200) {
        const blob = xhr.response;
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        resolve();
      } else {
        reject(new Error(`Download failed with status: ${xhr.status}`));
      }
    };

    xhr.onerror = function () {
      reject(new Error("Download failed due to network error"));
    };

    xhr.send();
  });
}

