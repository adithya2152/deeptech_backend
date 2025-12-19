import jwt from 'jsonwebtoken';
const jwtSecret = process.env.JWT_SECRET;


if(!jwtSecret){
    throw new Error("JWT_SECRET is not defined in environment variables");
}

const auth = (req,res,next)=>
{
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if(!token){
        return res.status(401).json({message: "Access Denied. No token provided."});
    }
    try{
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded.user;
        next();
    }
    catch(err){
        console.error("JWT Verification Error: ", err.message);
        return res.status(401).json({message: "Invalid Token."});
    }
};

module.exports = (
    auth
)