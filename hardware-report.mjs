import {readFile} from 'node:fs/promises';
import {validateInventory} from './inventory-core.mjs?v=cloud20261110-14';
import {analyzeHardware} from './hardware-map.mjs?v=cloud20261110-14';
const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
try{
 const data=validateInventory(JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8')));
 const id=value('--device'),pin=value('--pin');
 const reports=(id?[analyzeHardware(data,id)]:data.devices.map(d=>analyzeHardware(data,d.id))).map(report=>pin?{...report,pins:report.pins.filter(row=>row.pin.toUpperCase()===pin.toUpperCase())}:report);
 if(pin&&!reports.some(r=>r.pins.length))throw Error('Pin bu kapsamda bulunamadı.');
 process.stdout.write(JSON.stringify(id?reports[0]:reports,null,2)+'\n');
}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
