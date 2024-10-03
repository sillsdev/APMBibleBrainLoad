//import AWS, { Lambda, config } from 'aws-sdk';
import { Handler, Context, Callback } from 'aws-lambda';
import axios from 'axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';


interface PostAllowed {
  data: {
    type: string;
    attributes: {
      allowed: string;
    }
  }
}
interface Bible {
  data: {
    type: string;
    id: string,
    attributes: {
      bibleid: string;
      iso: string;
      shortname: string;
      biblename: string;
      languagename: string;
      languageid: number;
      pubdate: string;
    }
  }
}
interface BibleFileset {
  data: {
    type: string,
    id: string,
    attributes: {
        "bible-id": string,
        "fileset-id": string,
        "media-type": string,
        "fileset-size": string,
        timing: boolean
        codec: string,
        container:string,
        bitrate:string,
        licensor: string
    }
  }
}
//const handler: Handler = (event: any, context: Context, callback: Callback) => {
const main = async () => {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = "0";
  function getEnvVarOrThrow(value: string | undefined): string {
    if (value === undefined)
      throw new Error(`Undefined environment variable {value}`);
    return value;
  }
  function getEnvVarOrDefault(value: string | undefined, def: string): string {
    if (value === undefined)
      return def;
    return value;
  }
  const bbUrl = "https://4.dbt.io/api/";
  const host: string = getEnvVarOrDefault(process.env.SIL_TR_HOST, "https://localhost:7025");
  const stagepath: string = getEnvVarOrDefault(process.env.SIL_TR_URLPATH, "");
  const bbkey: string = getEnvVarOrThrow(process.env.SIL_TR_BIBLEBRAIN);
  const getBBBiblesUrl = `${bbUrl}bibles?v=4&type=audio&key=${bbkey}`;
  const config: AxiosRequestConfig  = {
    headers: {
      'Content-Type': 'application/vnd.api+json',
    }
  };
  async function DoPostAllowed(pd: PostAllowed) {
    /*
    var pd: PostAllowed = 
    {       
      data:
      {
        type: "biblebrainfilesets",
        attributes: {
              allowed: '{"type": "audio","language": "Akeu", "licensor": "SIL",  "fileset_id": "AEUWBTP1DA"}'
              }
      }
    }; */
    var url =  host + stagepath + "/api/biblebrainfilesets/allowed";
      
    try {
      const response: AxiosResponse = await axios.post<PostAllowed>(url, pd, config);
      if (response.status != 200) {
        throw new Error('Network response was not ok');
      }
      return response.data;  
    } catch (error) {
      console.error(error);
    }
  }

  async function postAllowed() {
    var geturl = `${bbUrl}download/list?v=4&type=audio&key=${bbkey}`;
    var pd: PostAllowed = 
    {       
      "data": {
          "type": "biblebrainfilesets",
          "attributes": {
              "allowed":""
              }
      }
    };
    var pages = 1;
    for (var ix = 1; ix <= pages; ix++) {
      var url = geturl + "&page=" + ix;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const responseData = await response.json();
      console.log(responseData);
      var data = responseData.data;
      if (ix == 1) {
        pages = responseData.meta.pagination.total_pages;
        console.log('total pages', pages);
      }

      for (var jx = 0; jx < data.length; jx++) {
        var fileset = data[jx];
        pd.data.attributes.allowed =  JSON.stringify(fileset);
        await DoPostAllowed(pd);
      }
      console.log('done page', ix);
    }
    return "done";
  }
  async function DoPostBible(bbBible: any) {
    var bibleurl =  host + stagepath + "/api/biblebrainbibles";
    var fileseturl =  host + stagepath + "/api/biblebrainfilesets";

    try {
      //first try to update the filesets.  If any succeed, then create the bible
      var createBible = false;
      for (var ix = 0; ix < bbBible.filesets["dbp-prod"]?.length; ix++) {
        var fileset = bbBible.filesets["dbp-prod"][ix];
        var myfs = await axios.get(`${fileseturl}/fs/${fileset.id}`, config);
        if (myfs.data.data !== null) {
          createBible = true;
          var bf: BibleFileset = myfs.data;
          bf.data.attributes["bible-id"] = bbBible.abbr;
          bf.data.attributes["fileset-size"] = fileset.size;
          bf.data.attributes.codec = fileset.codec;
          bf.data.attributes.container = fileset.container;
          bf.data.attributes.bitrate = fileset.bitrate;
          await axios.patch(`${fileseturl}/${bf.data.id}`, bf, config);
        }
      }
      if (createBible) {
        var bible  = {
          data: {
            type: "biblebrainbibles",
            attributes: {
              iso: bbBible.iso,
              languagename: bbBible.language,
              languageid: bbBible.language_id,
              biblename: bbBible.vname ?? bbBible.name,
              bibleid: bbBible.abbr,
              shortname: bbBible.name,
              pubdate: bbBible.date
            }
          }
        } as Bible;
        await axios.post(`${bibleurl}`, bible, config);
      }
      return createBible;  
    } catch (error) {
      console.error(error);
    }
  }
  async function postBibles() {
     var pages = 1;
    for (var ix = 1; ix <= pages; ix++) {
      var url = getBBBiblesUrl + "&page=" + ix;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const responseData = await response.json();
      var data = responseData.data;
      if (ix == 1) {
        pages = responseData.meta.pagination.last_page;
        console.log('total pages', pages);
      }

      for (var jx = 0; jx < data.length; jx++) {
        await DoPostBible(data[jx]);
      }
      console.log('done page', ix);
    }
    return "done";
  }
  async function DoUpdateTiming(bbBible:any) {
    var url =  host + stagepath + "/api/biblebrainfilesets";

    for (var ix = 0; ix < bbBible.filesets["dbp-prod"]?.length; ix++) {
      var fileset = bbBible.filesets["dbp-prod"][ix];
      if (fileset["timing_est_err"] !== undefined) {
        await axios.post(`${url}/timing/${fileset.id}`, undefined, config);
      }
    }
  }

  async function UpdateTiming() {
    var pages = 1;
    for (var ix = 1; ix <= pages; ix++) {
      var url = getBBBiblesUrl + "&audio_timing=true&page=" + ix;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const responseData = await response.json();
      var data = responseData.data;
      if (ix == 1) {
        pages = responseData.meta.pagination.last_page;
        console.log('total pages', pages);
      }

      for (var jx = 0; jx < data.length; jx++) {
        await DoUpdateTiming(data[jx]);
      }
      console.log('done page', ix);
    }
    return "done";
  }
  //await postAllowed();
  //await postBibles();
  await UpdateTiming();

}
main();
export default main;
//};
