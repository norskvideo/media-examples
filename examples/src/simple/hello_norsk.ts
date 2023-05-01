import { Norsk, selectAV } from "@id3asnorsk/norsk-sdk"

export async function main() {
  const norsk = await Norsk.connect({});  
  console.log(`Hello from norsk version: ${norsk.version.label}`); 
  norsk.close(); 
}
