using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using PropertyManagement.Infrastructure.Services;

namespace PropertyManagement.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin")]
    public class AzureController : ControllerBase
    {
        private readonly IAzureAccountValidator _azureAccountValidator;

        public AzureController(IAzureAccountValidator azureAccountValidator)
        {
            _azureAccountValidator = azureAccountValidator;
        }

        [HttpGet("validate-account")]
        public async Task<IActionResult> ValidateAccount()
        {
            var result = await _azureAccountValidator.ValidateAccountAsync();
            return Ok(result);
        }
    }
} 