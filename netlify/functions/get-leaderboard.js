// netlify/functions/get-leaderboard.js
const faunadb = require('faunadb');
const q = faunadb.query;

const client = new faunadb.Client({
  secret: process.env.FAUNADB_SECRET
});

exports.handler = async (event, context) => {
  const mode = event.queryStringParameters.mode;
  if (!mode) {
    return { statusCode: 400, body: "Missing mode parameter" };
  }
  try {
    const result = await client.query(
      q.Paginate(
        q.Match(q.Index("top_scores_by_mode"), mode),
        { size: 10 }
      )
    );
    // result.data is an array of values (each value is the score, since we used the score field in the index)
    // To get the full document (including name), we need to map over the refs.
    // But if your index only returns the score, consider modifying the index to return the document reference.
    // For this example, we assume our index returns the document ref in addition to the score.
    const refs = result.data.map(item => item.ref);
    const documents = await client.query(
      q.Map(refs, q.Lambda("ref", q.Get(q.Var("ref"))))
    );
    // Map the documents to just the needed data.
    const leaderboard = documents.map(doc => doc.data);
    return {
      statusCode: 200,
      body: JSON.stringify({ leaderboard })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server Error" };
  }
};
